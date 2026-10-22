import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ChangeSet } from '../domain/change-set.mjs';
import { Checkout } from '../domain/checkout.mjs';
import { CommitSha } from '../domain/primitives.mjs';
import { PullRequest } from '../domain/pull-request.mjs';
import { Result } from '../domain/result.mjs';
import { RULES_SITE_URL } from '../domain/rulebook.mjs';
import { Thread, Threads } from '../domain/threads.mjs';
import { writeRawJson } from './fs-store.mjs';
import { runCommand } from './shell.mjs';

const HOST_SIDE_OF = { head: 'right', base: 'left' };
const VOTE_OF = { approve: 'approve', 'request-changes': 'wait-for-author' };
const PRIOR_REGEX = / probes at ([0-9a-f]{40})\b/;
const organizationUrl = (host) => `https://dev.azure.com/${host.organization}`;

export function buildAdoRouteParams(host) {
  return ['--route-parameters', `project=${host.project}`, `repositoryId=${host.repository}`, `pullRequestId=${host.id}`];
}

export function buildAdoThreadRouteParams(host, threadId) {
  return [...buildAdoRouteParams(host), `threadId=${threadId}`];
}

const isOnLines = (raw) => raw.threadContext !== null && raw.threadContext !== undefined && raw.threadContext.filePath !== null;
const firstCommentText = (raw) =>
  Array.isArray(raw.comments) && raw.comments.length > 0 && typeof raw.comments[0].content === 'string'
    ? raw.comments[0].content
    : '';
const isOurThread = (raw) => Thread.isOurs(firstCommentText(raw));

export function foldAdoThread(raw) {
  const ctx = raw.threadContext;
  const side = ctx.rightFileEnd !== null && ctx.rightFileEnd !== undefined ? 'head' : 'base';
  const startObj = side === 'head' ? ctx.rightFileStart : ctx.leftFileStart;
  const endObj = side === 'head' ? ctx.rightFileEnd : ctx.leftFileEnd;
  const startLine = startObj !== null && startObj !== undefined ? startObj.line : endObj.line;
  return Thread.fromRaw({
    id: String(raw.id),
    path: ctx.filePath.replace(/^\//, ''),
    side,
    lines: { start: startLine, end: endObj.line },
    state: raw.status === 'active' ? 'open' : 'resolved-by-author',
    body: firstCommentText(raw),
  });
}

export function findAdoRefusedThreadId(rawThreads, headCommit) {
  const found = rawThreads.find(
    (raw) => !isOnLines(raw) && isOurThread(raw) && firstCommentText(raw).includes(`Not reviewed at ${headCommit} `),
  );
  return found !== undefined ? String(found.id) : null;
}

export function findAdoStaleRefusalIds(rawThreads) {
  return rawThreads
    .filter((raw) => !isOnLines(raw) && isOurThread(raw) && raw.status === 'active' && firstCommentText(raw).includes('Not reviewed at '))
    .map((raw) => String(raw.id));
}

export function findAdoPriorCommit(rawThreads) {
  const matches = rawThreads
    .filter((raw) => !isOnLines(raw) && isOurThread(raw))
    .map((raw) => PRIOR_REGEX.exec(firstCommentText(raw)))
    .filter((m) => m !== null);
  const last = matches.at(-1);
  return last !== undefined ? last[1] : null;
}

export const buildAdoTextThread = (content) => ({
  comments: [{ parentCommentId: 0, commentType: 'text', content }],
  status: 'active',
});

export function buildAdoThreadPayload(finding) {
  const side = HOST_SIDE_OF[finding.side().toContract()];
  const { start, end } = finding.lines().toContract();
  return {
    ...buildAdoTextThread(finding.body().toContract()),
    threadContext: {
      filePath: `/${finding.path().toContract()}`,
      [`${side}FileStart`]: { line: start, offset: 1 },
      [`${side}FileEnd`]: { line: end, offset: 1 },
    },
  };
}

export function filterAdoUnposted(outcome, rawThreads) {
  const active = rawThreads.filter((raw) => raw.status === 'active' && isOurThread(raw));
  const carried = active.filter(isOnLines).map((r) => foldAdoThread(r).unwrap().toContract());
  const inline = outcome.inline().filter((finding) => {
    const f = finding.toContract();
    return !carried.some((ex) => ex.path === f.path && ex.lines.end === f.lines.end && ex.body === f.body);
  });
  const headStr = outcome.headCommit().toContract();
  const summary = !active.some((raw) => !isOnLines(raw) && firstCommentText(raw).includes(`probes at ${headStr} `));
  const activeIds = new Set(active.map((raw) => String(raw.id)));
  const settle = outcome.settle().map((id) => id.toContract()).filter((id) => activeIds.has(id));
  return { inline, summary, settle };
}

function ensureFetchedRepo(run, host, pr, headRaw, repository) {
  const git = (...args) => run('git', ['-C', repository, ...args]);
  if (!existsSync(join(repository, '.git'))) {
    mkdirSync(repository, { recursive: true });
    git('init', '-q');
    git(
      'fetch', '-q', `${organizationUrl(host)}/${host.project}/_git/${host.repository}`,
      `+${pr.sourceRefName}:refs/remotes/review/source`, `+${pr.targetRefName}:refs/remotes/review/target`,
    );
    const at = git('rev-parse', 'review/source').trim();
    if (at !== headRaw) throw new Error(`the source branch is at ${at}, the pull request at ${headRaw}: it moved while being reviewed`);
  }
  return git;
}

export function createAzureDevOpsAdapter(run) {
  const az = (...args) => JSON.parse(run('az', [...args, '--output', 'json']));
  const invokeCollection = (host, extraArgs) =>
    az('devops', 'invoke', '--organization', organizationUrl(host), '--area', 'git', '--resource', 'pullRequestThreads', ...buildAdoRouteParams(host), '--api-version', '7.1', ...extraArgs);
  const invokeThread = (host, threadId, extraArgs) =>
    az('devops', 'invoke', '--organization', organizationUrl(host), '--area', 'git', '--resource', 'pullRequestThreads', ...buildAdoThreadRouteParams(host, threadId), '--api-version', '7.1', ...extraArgs);
  const sendCollection = (host, workdir, name, body) =>
    invokeCollection(host, ['--http-method', 'POST', '--in-file', writeRawJson(join(workdir, 'post', `${name}.json`), body)]);
  const patchThread = (host, workdir, name, threadId, body) =>
    invokeThread(host, threadId, ['--http-method', 'PATCH', '--in-file', writeRawJson(join(workdir, 'post', `${name}.json`), body)]);
  return Object.freeze({
    kind: 'azure-devops',
    resolve(host, workdir) {
      const pr = az('repos', 'pr', 'show', '--id', String(host.id), '--organization', organizationUrl(host));
      const headRaw = pr.lastMergeSourceCommit.commitId;
      const headCommit = CommitSha.fromRaw(headRaw).unwrap();
      const buildPolicies = az('repos', 'pr', 'policy', 'list', '--id', String(host.id), '--organization', organizationUrl(host))
        .filter((p) => p.configuration.isBlocking && p.configuration.type.displayName === 'Build');
      const blocked = [
        ...buildPolicies.filter((p) => p.status !== 'approved').map((p) => `the blocking Build policy is ${p.status}`),
        ...(pr.mergeStatus === 'conflicts' ? ['the pull request has merge conflicts'] : []),
      ];
      const rawThreads = invokeCollection(host, []).value;
      const priorRaw = findAdoPriorCommit(rawThreads);
      const prior = priorRaw !== null ? CommitSha.fromRaw(priorRaw).unwrap() : null;
      const folded = prior === null ? [] : Result.collect(rawThreads.filter((c) => isOnLines(c) && isOurThread(c)).map(foldAdoThread)).unwrap();
      const threads = Threads.fromRaw({ threads: folded.map((t) => t.toContract()) }).unwrap();
      const repository = join(workdir, 'repository');
      const repo = () => ensureFetchedRepo(run, host, pr, headRaw, repository);
      const description = typeof pr.description === 'string' ? pr.description : '';
      const pullRequest = PullRequest.fromRaw({ host, author: pr.createdBy.uniqueName, description }).unwrap();
      return {
        pullRequest,
        headCommit,
        blocked,
        prior,
        refused: findAdoRefusedThreadId(rawThreads, headRaw),
        threads,
        diff: () => ChangeSet.fromDiff(headRaw, repo()('diff', '--no-color', repo()('merge-base', 'review/target', headRaw).trim(), headRaw)).unwrap(),
        changedSince: (priorCommit) =>
          new Map(
            ChangeSet.fromDiff(headRaw, repo()('diff', '--no-color', priorCommit.toContract(), headRaw))
              .unwrap().files().map((f) => [f.path().toContract(), f.added()]),
          ),
        checkout: (dir) => {
          mkdirSync(dir, { recursive: true });
          const tarball = `${dir}.tar`;
          repo()('archive', '--format=tar', '-o', tarball, headRaw);
          run('tar', ['-xf', tarball, '-C', dir]);
          return Checkout.fromRaw(dir).unwrap();
        },
      };
    },
    refuse(host, headCommit, reasons, workdir) {
      const content = `**Verdict: request-changes**\n\nNot reviewed at ${headCommit.toContract()} against [the rules](${RULES_SITE_URL}): ${reasons.join('; ')}.`;
      return String(sendCollection(host, workdir, 'refusal', buildAdoTextThread(content)).id);
    },
    post(host, outcome, ledgerTable, workdir) {
      const before = invokeCollection(host, []).value;
      const left = filterAdoUnposted(outcome, before);
      const created = left.inline.map((f, idx) => sendCollection(host, workdir, `thread-${String(idx + 1).padStart(3, '0')}`, buildAdoThreadPayload(f)).id);
      const summaryId = left.summary ? sendCollection(host, workdir, 'summary', buildAdoTextThread(`${outcome.summary().toContract()}\n\n${ledgerTable}`)).id : null;
      left.settle.forEach((id) => patchThread(host, workdir, `settle-${id}`, id, { status: 'fixed' }));
      outcome.reopen().forEach((id) => patchThread(host, workdir, `reopen-${id.toContract()}`, id.toContract(), { status: 'active' }));
      const stale = findAdoStaleRefusalIds(before);
      stale.forEach((id) => patchThread(host, workdir, `refusal-${id}`, id, { status: 'fixed' }));
      const vote = VOTE_OF[outcome.verdict()];
      run('az', ['repos', 'pr', 'set-vote', '--id', String(host.id), '--vote', vote, '--organization', organizationUrl(host), '--output', 'json']);
      return {
        summaryThread: summaryId !== null ? summaryId : 'already posted',
        inline: created.length,
        alreadyPosted: outcome.inline().length - created.length,
        settled: left.settle.length,
        reopened: outcome.reopen().length,
        refusalsClosed: stale.length,
        vote,
      };
    },
  });
}

export const azureDevOpsAdapter = createAzureDevOpsAdapter(runCommand);
