import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseHunks, SITE } from './lib.mjs';
import { run } from './shell.mjs';

export const KIND = 'github';
const PULL_REQUEST_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;
const SIDE_OF = { RIGHT: 'head', LEFT: 'base' };
const HOST_SIDE_OF = { head: 'RIGHT', base: 'LEFT' };
const EVENT_OF = { approve: 'APPROVE', 'request-changes': 'REQUEST_CHANGES' };
const OWN_PULL_REQUEST = /own pull request/i;

const gh = (...args) => JSON.parse(run('gh', ['api', ...args]));
const pulls = (host) => `repos/${host.owner}/${host.repository}/pulls/${host.number}`;
function paginate(path) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const batch = gh(`${path}?per_page=100&page=${page}`);
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}

export function locate(target) {
  const match = PULL_REQUEST_URL.exec(target);
  if (match === null) return undefined;
  return { kind: KIND, owner: match[1], repository: match[2], number: Number(match[3]) };
}

export function thread(node, author) {
  const state = !node.isResolved ? 'open' : node.resolvedBy?.login === author ? 'resolved-by-author' : 'resolved';
  return {
    id: node.id,
    path: node.path,
    side: SIDE_OF[node.diffSide],
    lines: { start: node.startLine ?? node.line, end: node.line },
    state,
    body: node.comments.nodes[0].body,
  };
}

const THREADS = 'query($owner:String!,$repository:String!,$number:Int!,$after:String){repository(owner:$owner,name:$repository){pullRequest(number:$number){reviewThreads(first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{id path line startLine diffSide isResolved resolvedBy{login}comments(first:1){nodes{body}}}}}}}';
function allThreads(host) {
  const nodes = [];
  let after = null;
  do {
    const page = gh('graphql', '-f', `query=${THREADS}`, '-F', `owner=${host.owner}`, '-F', `repository=${host.repository}`, '-F', `number=${host.number}`, ...(after === null ? [] : ['-F', `after=${after}`]))
      .data.repository.pullRequest.reviewThreads;
    nodes.push(...page.nodes);
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after !== null);
  return nodes;
}

const ours = (text) => text.includes(SITE);

export function refusedIn(reviews, headCommit) {
  return reviews.find((review) => review.state !== 'PENDING' && ours(review.body) && review.body.includes(`Not reviewed at ${headCommit} `))?.html_url;
}

export function resolve(host) {
  const pr = gh(pulls(host));
  const headCommit = pr.head.sha;
  const checks = gh(`repos/${host.owner}/${host.repository}/commits/${headCommit}/check-runs`);
  const failed = checks.check_runs.filter((check) => !['success', 'skipped', 'neutral'].includes(check.conclusion)).map((check) => `check ${check.name} did not succeed`);
  const blocked = [...failed, ...(pr.mergeable_state === 'dirty' ? ['the pull request has merge conflicts'] : [])];
  const reviews = paginate(`${pulls(host)}/reviews`);
  const prior = reviews.filter((review) => review.state !== 'PENDING' && ours(review.body)).at(-1)?.commit_id;
  const threads = prior === undefined ? [] : allThreads(host)
    .filter((node) => node.line !== null && ours(node.comments.nodes[0]?.body ?? ''))
    .map((node) => thread(node, pr.user.login));
  return {
    pullRequest: { host, author: pr.user.login, description: pr.body ?? '' },
    headCommit,
    blocked,
    prior,
    refused: refusedIn(reviews, headCommit),
    threads,
    diff: () => run('gh', ['api', pulls(host), '-H', 'Accept: application/vnd.github.diff']),
    changedSince: (priorHead) => new Map(gh(`repos/${host.owner}/${host.repository}/compare/${priorHead}...${headCommit}`).files
      .filter((file) => file.patch !== undefined).map((file) => [file.filename, parseHunks(file.patch.split('\n')).added])),
    checkout: (dir) => {
      const tarball = `${dir}.tgz`;
      writeFileSync(tarball, run('gh', ['api', `repos/${host.owner}/${host.repository}/tarball/${headCommit}`], 'buffer'));
      mkdirSync(dir, { recursive: true });
      run('tar', ['-xzf', tarball, '-C', dir, '--strip-components=1']);
      rmSync(tarball);
    },
  };
}

export function comment(finding) {
  const side = HOST_SIDE_OF[finding.side];
  const { start, end } = finding.lines;
  if (start === end) return { path: finding.path, line: end, side, body: finding.body };
  return { path: finding.path, start_line: start, start_side: side, line: end, side, body: finding.body };
}

export function payload(outcome, ledgerTable) {
  const body = [outcome.summary, `<details>\n<summary>Review ledger</summary>\n\n${ledgerTable}\n\n</details>`].join('\n\n');
  return { commit_id: outcome.headCommit, event: EVENT_OF[outcome.verdict], body, comments: outcome.inline.map(comment) };
}

function postReview(host, review, workdir) {
  const file = join(workdir, 'review.json');
  writeFileSync(file, `${JSON.stringify(review, null, 2)}\n`);
  try {
    return gh('-X', 'POST', `${pulls(host)}/reviews`, '--input', file);
  } catch (error) {
    if (!OWN_PULL_REQUEST.test(error.message) || review.event === 'COMMENT') throw error;
    return postReview(host, { ...review, event: 'COMMENT', body: `${review.body}\n\nPosted as a comment: the host refused the verdict on the author's own pull request.` }, workdir);
  }
}

export function refuse(host, headCommit, reasons, workdir) {
  const body = `**Verdict: request-changes**\n\nNot reviewed at ${headCommit} against [the rules](${SITE}): ${reasons.join('; ')}.`;
  return postReview(host, { commit_id: headCommit, event: 'REQUEST_CHANGES', body }, workdir).html_url;
}

const settle = (id, mutation) => gh('graphql', '-f', `query=mutation($id:ID!){${mutation}(input:{threadId:$id}){thread{id}}}`, '-F', `id=${id}`);

export function post(host, outcome, ledgerTable, workdir) {
  const response = postReview(host, payload(outcome, ledgerTable), workdir);
  for (const id of outcome.settle) settle(id, 'resolveReviewThread');
  for (const id of outcome.reopen) settle(id, 'unresolveReviewThread');
  return { review: response.html_url, event: response.state, inline: outcome.inline.length, settled: outcome.settle.length, reopened: outcome.reopen.length };
}
