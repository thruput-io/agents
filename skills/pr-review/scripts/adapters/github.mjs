import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ChangeSet, parseHunkLines } from '../domain/change-set.mjs';
import { Checkout } from '../domain/checkout.mjs';
import { LineRange } from '../domain/line-range.mjs';
import { CommitSha } from '../domain/primitives.mjs';
import { PullRequest } from '../domain/pull-request.mjs';
import { Result } from '../domain/result.mjs';
import { RULES_SITE_URL } from '../domain/rulebook.mjs';
import { Thread, Threads } from '../domain/threads.mjs';
import { writeRawJson } from './fs-store.mjs';
import { runCommand, runCommandBuffer } from './shell.mjs';

const SIDE_OF = { RIGHT: 'head', LEFT: 'base' };
const HOST_SIDE_OF = { head: 'RIGHT', base: 'LEFT' };
const EVENT_OF = { approve: 'APPROVE', 'request-changes': 'REQUEST_CHANGES' };
const THREADS_QUERY =
  'query($owner:String!,$repository:String!,$number:Int!,$after:String){repository(owner:$owner,name:$repository){pullRequest(number:$number){reviewThreads(first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{id path line startLine diffSide isResolved resolvedBy{login}comments(first:1){nodes{body}}}}}}}';

const pullsPath = (host) => `repos/${host.owner}/${host.repository}/pulls/${host.number}`;

function paginateRest(gh, path, page, accumulated) {
  const batch = gh(`${path}?per_page=100&page=${page}`);
  const next = [...accumulated, ...batch];
  return batch.length < 100 ? next : paginateRest(gh, path, page + 1, next);
}

function paginateThreads(gh, host, afterCursor, accumulated) {
  const cursorArgs = afterCursor === null ? [] : ['-F', `after=${afterCursor}`];
  const page = gh(
    'graphql', '-f', `query=${THREADS_QUERY}`, '-F', `owner=${host.owner}`,
    '-F', `repository=${host.repository}`, '-F', `number=${host.number}`, ...cursorArgs,
  ).data.repository.pullRequest.reviewThreads;
  const next = [...accumulated, ...page.nodes];
  return page.pageInfo.hasNextPage ? paginateThreads(gh, host, page.pageInfo.endCursor, next) : next;
}

export function foldGitHubThread(node, author) {
  const resolvedLogin = node.resolvedBy !== null && node.resolvedBy !== undefined ? node.resolvedBy.login : '';
  const state = !node.isResolved ? 'open' : resolvedLogin === author ? 'resolved-by-author' : 'resolved';
  const startLine = typeof node.startLine === 'number' ? node.startLine : node.line;
  return Thread.fromRaw({
    id: node.id,
    path: node.path,
    side: SIDE_OF[node.diffSide],
    lines: { start: startLine, end: node.line },
    state,
    body: node.comments.nodes[0].body,
  });
}

export function findPostedReviewUrl(reviews, headCommit) {
  const found = reviews.find(
    (r) => r.state !== 'PENDING' && Thread.isOurs(r.body) && r.body.includes(`probes at ${headCommit} `),
  );
  return found !== undefined ? found.html_url : null;
}

export function findRefusedReviewUrl(reviews, headCommit) {
  const found = reviews.find(
    (r) => r.state !== 'PENDING' && Thread.isOurs(r.body) && r.body.includes(`Not reviewed at ${headCommit} `),
  );
  return found !== undefined ? found.html_url : null;
}

export function findPriorReviewCommit(reviews) {
  const found = reviews
    .filter((r) => r.state !== 'PENDING' && Thread.isOurs(r.body) && !r.body.includes('Not reviewed at '))
    .at(-1);
  return found !== undefined ? CommitSha.fromRaw(found.commit_id).unwrap() : null;
}

export function buildGitHubComment(finding) {
  const side = HOST_SIDE_OF[finding.side().toContract()];
  const { start, end } = finding.lines().toContract();
  const path = finding.path().toContract();
  const body = finding.body().toContract();
  if (start === end) return { path, line: end, side, body };
  return { path, start_line: start, start_side: side, line: end, side, body };
}

export function buildGitHubPayload(outcome, ledgerTable) {
  const body = [
    outcome.summary().toContract(),
    `<details>\n<summary>Review ledger</summary>\n\n${ledgerTable}\n\n</details>`,
  ].join('\n\n');
  return {
    commit_id: outcome.headCommit().toContract(),
    event: EVENT_OF[outcome.verdict()],
    body,
    comments: outcome.inline().map(buildGitHubComment),
  };
}

function submitReviewPayload(gh, host, payload, workdir) {
  const file = writeRawJson(join(workdir, 'review.json'), payload);
  return gh('-X', 'POST', `${pullsPath(host)}/reviews`, '--input', file);
}

export function createGitHubAdapter(run, runBuffer) {
  const gh = (...args) => JSON.parse(run('gh', ['api', ...args]));
  const mutateThread = (id, mutation) =>
    gh('graphql', '-f', `query=mutation($id:ID!){${mutation}(input:{threadId:$id}){thread{id}}}`, '-F', `id=${id}`);
  return Object.freeze({
    kind: 'github',
    resolve(host) {
      const pr = gh(pullsPath(host));
      const headRaw = pr.head.sha;
      const headCommit = CommitSha.fromRaw(headRaw).unwrap();
      const checks = gh(`repos/${host.owner}/${host.repository}/commits/${headRaw}/check-runs`);
      const failed = checks.check_runs
        .filter((check) => !['success', 'skipped', 'neutral'].includes(check.conclusion))
        .map((check) => `check ${check.name} did not succeed`);
      const blocked = [...failed, ...(pr.mergeable_state === 'dirty' ? ['the pull request has merge conflicts'] : [])];
      const reviews = paginateRest(gh, `${pullsPath(host)}/reviews`, 1, []);
      const prior = findPriorReviewCommit(reviews);
      const rawThreadNodes = prior === null
        ? []
        : paginateThreads(gh, host, null, []).filter((node) => {
            const firstBody = node.comments.nodes.length > 0 && typeof node.comments.nodes[0].body === 'string'
              ? node.comments.nodes[0].body
              : '';
            return node.line !== null && Thread.isOurs(firstBody);
          });
      const folded = Result.collect(rawThreadNodes.map((n) => foldGitHubThread(n, pr.user.login))).unwrap();
      const threads = Threads.fromRaw({ threads: folded.map((t) => t.toContract()) }).unwrap();
      const description = typeof pr.body === 'string' ? pr.body : '';
      const pullRequest = PullRequest.fromRaw({ host, author: pr.user.login, description }).unwrap();
      return {
        pullRequest,
        headCommit,
        blocked,
        prior,
        refused: findRefusedReviewUrl(reviews, headRaw),
        threads,
        diff: () => ChangeSet.fromDiff(headRaw, run('gh', ['api', pullsPath(host), '-H', 'Accept: application/vnd.github.diff'])).unwrap(),
        changedSince: (priorCommit) =>
          new Map(
            gh(`repos/${host.owner}/${host.repository}/compare/${priorCommit.toContract()}...${headRaw}`)
              .files.filter((file) => typeof file.patch === 'string')
              .map((file) => [file.filename, parseHunkLines(file.patch.split('\n')).added.map((r) => LineRange.fromRaw(r).unwrap())]),
          ),
        checkout: (dir) => {
          const tarball = `${dir}.tgz`;
          writeFileSync(tarball, runBuffer('gh', ['api', `repos/${host.owner}/${host.repository}/tarball/${headRaw}`]));
          mkdirSync(dir, { recursive: true });
          run('tar', ['-xzf', tarball, '-C', dir, '--strip-components=1']);
          rmSync(tarball);
          return Checkout.fromRaw(dir).unwrap();
        },
      };
    },
    refuse(host, headCommit, reasons, workdir) {
      const body = `**Verdict: request-changes**\n\nNot reviewed at ${headCommit.toContract()} against [the rules](${RULES_SITE_URL}): ${reasons.join('; ')}.`;
      return submitReviewPayload(gh, host, { commit_id: headCommit.toContract(), event: 'REQUEST_CHANGES', body }, workdir).html_url;
    },
    post(host, outcome, ledgerTable, workdir) {
      const headStr = outcome.headCommit().toContract();
      const already = findPostedReviewUrl(paginateRest(gh, `${pullsPath(host)}/reviews`, 1, []), headStr);
      const response = already === null ? submitReviewPayload(gh, host, buildGitHubPayload(outcome, ledgerTable), workdir) : null;
      outcome.settle().forEach((id) => mutateThread(id.toContract(), 'resolveReviewThread'));
      outcome.reopen().forEach((id) => mutateThread(id.toContract(), 'unresolveReviewThread'));
      return {
        review: already !== null ? already : response.html_url,
        posted: already === null,
        inline: outcome.inline().length,
        settled: outcome.settle().length,
        reopened: outcome.reopen().length,
      };
    },
  });
}

export const githubAdapter = createGitHubAdapter(runCommand, runCommandBuffer);
