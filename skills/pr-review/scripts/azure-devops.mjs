import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDiff, SITE } from './lib.mjs';
import { run } from './shell.mjs';

export const KIND = 'azure-devops';
const PULL_REQUEST_URL = /^https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)/;
const HOST_SIDE_OF = { head: 'right', base: 'left' };
const VOTE_OF = { approve: 'approve', 'request-changes': 'wait-for-author' };
const PRIOR = / probes at ([0-9a-f]{40})\b/;

const organization = (host) => `https://dev.azure.com/${host.organization}`;
const az = (...args) => JSON.parse(run('az', [...args, '--output', 'json']));
const invoke = (host, args) => az('devops', 'invoke', '--organization', organization(host), '--area', 'git', '--resource', 'pullRequestThreads',
  '--route-parameters', `project=${host.project}`, `repositoryId=${host.repository}`, `pullRequestId=${host.id}`, '--api-version', '7.1', ...args);

export function locate(target) {
  const match = PULL_REQUEST_URL.exec(target);
  if (match === null) return undefined;
  return { kind: KIND, organization: match[1], project: match[2], repository: match[3], id: Number(match[4]) };
}

const onLines = (raw) => raw.threadContext !== null && raw.threadContext !== undefined && raw.threadContext.filePath !== null;
const firstComment = (raw) => raw.comments[0]?.content ?? '';
const ours = (raw) => firstComment(raw).includes(SITE);

export function thread(raw) {
  const context = raw.threadContext;
  const side = context.rightFileEnd !== null && context.rightFileEnd !== undefined ? 'head' : 'base';
  const start = side === 'head' ? context.rightFileStart : context.leftFileStart;
  const end = side === 'head' ? context.rightFileEnd : context.leftFileEnd;
  return {
    id: String(raw.id),
    path: context.filePath.replace(/^\//, ''),
    side,
    lines: { start: start?.line ?? end.line, end: end.line },
    state: raw.status === 'active' ? 'open' : 'resolved-by-author',
    body: firstComment(raw),
  };
}

const refusal = (headCommit) => (content) => content.includes(`Not reviewed at ${headCommit} `);

export function refusedOf(rawThreads, headCommit) {
  const found = rawThreads.find((raw) => !onLines(raw) && ours(raw) && refusal(headCommit)(firstComment(raw)));
  return found === undefined ? undefined : String(found.id);
}

export function staleRefusals(rawThreads) {
  return rawThreads.filter((raw) => !onLines(raw) && ours(raw) && raw.status === 'active' && firstComment(raw).includes('Not reviewed at ')).map((raw) => String(raw.id));
}

export function priorOf(rawThreads) {
  const summaries = rawThreads.filter((raw) => !onLines(raw) && ours(raw)).map((raw) => PRIOR.exec(firstComment(raw))).filter((match) => match !== null);
  return summaries.at(-1)?.[1];
}

export function resolve(host, workdir) {
  const pr = az('repos', 'pr', 'show', '--id', String(host.id), '--organization', organization(host));
  const headCommit = pr.lastMergeSourceCommit.commitId;
  const build = az('repos', 'pr', 'policy', 'list', '--id', String(host.id), '--organization', organization(host))
    .filter((policy) => policy.configuration.isBlocking && policy.configuration.type.displayName === 'Build');
  const blocked = [
    ...build.filter((policy) => policy.status !== 'approved').map((policy) => `the blocking Build policy is ${policy.status}`),
    ...(pr.mergeStatus === 'conflicts' ? ['the pull request has merge conflicts'] : []),
  ];
  const raw = invoke(host, []).value;
  const prior = priorOf(raw);
  const threads = prior === undefined ? [] : raw.filter((candidate) => onLines(candidate) && ours(candidate)).map(thread);
  const repository = join(workdir, 'repository');
  const git = (...args) => run('git', ['-C', repository, ...args]);
  const fetched = () => {
    mkdirSync(repository, { recursive: true });
    git('init', '-q');
    git('fetch', '-q', `${organization(host)}/${host.project}/_git/${host.repository}`, `+${pr.sourceRefName}:refs/remotes/review/source`, `+${pr.targetRefName}:refs/remotes/review/target`);
    const at = git('rev-parse', 'review/source').trim();
    if (at !== headCommit) throw new Error(`the source branch is at ${at}, the pull request at ${headCommit}: it moved while being reviewed`);
    return git;
  };
  let ready;
  const repo = () => { ready ??= fetched(); return ready; };
  return {
    pullRequest: { host, author: pr.createdBy.uniqueName, description: pr.description ?? '' },
    headCommit,
    blocked,
    prior,
    refused: refusedOf(raw, headCommit),
    threads,
    diff: () => repo()('diff', '--no-color', repo()('merge-base', 'review/target', headCommit).trim(), headCommit),
    changedSince: (priorHead) => new Map(parseDiff(repo()('diff', '--no-color', priorHead, headCommit)).map((file) => [file.path, file.added])),
    checkout: (dir) => {
      mkdirSync(dir, { recursive: true });
      const tarball = `${dir}.tar`;
      repo()('archive', '--format=tar', '-o', tarball, headCommit);
      run('tar', ['-xf', tarball, '-C', dir]);
    },
  };
}

export const text = (content) => ({ comments: [{ parentCommentId: 0, commentType: 'text', content }], status: 'active' });

export function threadPayload(finding) {
  const side = HOST_SIDE_OF[finding.side];
  const { start, end } = finding.lines;
  return { ...text(finding.body), threadContext: { filePath: `/${finding.path}`, [`${side}FileStart`]: { line: start, offset: 1 }, [`${side}FileEnd`]: { line: end, offset: 1 } } };
}

function send(host, workdir, name, body, args) {
  mkdirSync(join(workdir, 'post'), { recursive: true });
  const file = join(workdir, 'post', `${name}.json`);
  writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
  return invoke(host, ['--http-method', args.method, '--in-file', file, ...(args.threadId === undefined ? [] : ['--route-parameters', `threadId=${args.threadId}`])]);
}

export function refuse(host, headCommit, reasons, workdir) {
  const content = `**Verdict: request-changes**\n\nNot reviewed at ${headCommit} against [the rules](${SITE}): ${reasons.join('; ')}.`;
  return String(send(host, workdir, 'refusal', text(content), { method: 'POST' }).id);
}

export function post(host, outcome, ledgerTable, workdir) {
  const threads = outcome.inline.map((finding, index) => send(host, workdir, `thread-${String(index + 1).padStart(3, '0')}`, threadPayload(finding), { method: 'POST' }).id);
  const summary = send(host, workdir, 'summary', text(`${outcome.summary}\n\n${ledgerTable}`), { method: 'POST' }).id;
  for (const id of outcome.settle) send(host, workdir, `settle-${id}`, { status: 'fixed' }, { method: 'PATCH', threadId: id });
  for (const id of outcome.reopen) send(host, workdir, `reopen-${id}`, { status: 'active' }, { method: 'PATCH', threadId: id });
  const stale = staleRefusals(invoke(host, []).value);
  for (const id of stale) send(host, workdir, `refusal-${id}`, { status: 'fixed' }, { method: 'PATCH', threadId: id });
  run('az', ['repos', 'pr', 'set-vote', '--id', String(host.id), '--vote', VOTE_OF[outcome.verdict], '--organization', organization(host), '--output', 'json']);
  return { summaryThread: summary, inline: threads.length, settled: outcome.settle.length, reopened: outcome.reopen.length, refusalsClosed: stale.length, vote: VOTE_OF[outcome.verdict] };
}
