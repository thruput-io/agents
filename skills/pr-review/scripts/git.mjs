import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve as absolute } from 'node:path';
import { run } from './shell.mjs';

export const KIND = 'git';
const RANGE = /^(.+)@([^.]+(?:\.[^.]+)*)\.\.([^.].*)$/;

export function locate(target) {
  const match = RANGE.exec(target);
  if (match === null) return undefined;
  return { kind: KIND, repository: absolute(match[1]), base: match[2], head: match[3] };
}

export function resolve(host) {
  const git = (...args) => run('git', ['-C', host.repository, ...args]);
  const headCommit = git('rev-parse', '--verify', `${host.head}^{commit}`).trim();
  const base = git('merge-base', host.base, headCommit).trim();
  return {
    pullRequest: { host, author: git('log', '-1', '--format=%ae', headCommit).trim(), description: git('log', '--format=%B', `${base}..${headCommit}`).trim() },
    headCommit,
    blocked: [],
    prior: undefined,
    threads: [],
    diff: () => git('diff', '--no-color', base, headCommit),
    changedSince: () => new Map(),
    checkout: (dir) => {
      mkdirSync(dir, { recursive: true });
      const tarball = `${dir}.tar`;
      git('archive', '--format=tar', '-o', tarball, headCommit);
      run('tar', ['-xf', tarball, '-C', dir]);
    },
  };
}

export function refuse(host, headCommit, reasons) {
  return `not reviewed at ${headCommit}: ${reasons.join('; ')}`;
}

export function rendered(outcome, ledgerTable) {
  const findings = outcome.inline.map((finding) => `- \`${finding.path}:${finding.lines.start}-${finding.lines.end}\` (${finding.side}): ${finding.body}`);
  return `${[outcome.summary, ...(findings.length === 0 ? [] : [findings.join('\n')]), ledgerTable].join('\n\n')}\n`;
}

export function post(host, outcome, ledgerTable, workdir) {
  const file = join(workdir, 'review.md');
  writeFileSync(file, rendered(outcome, ledgerTable));
  return { review: file, inline: outcome.inline.length };
}
