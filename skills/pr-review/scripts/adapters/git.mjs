import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ChangeSet } from '../domain/change-set.mjs';
import { Checkout } from '../domain/checkout.mjs';
import { CommitSha } from '../domain/primitives.mjs';
import { PullRequest } from '../domain/pull-request.mjs';
import { Threads } from '../domain/threads.mjs';
import { writeTextFile } from './fs-store.mjs';
import { runCommand } from './shell.mjs';

export function renderGitReview(outcome, ledgerTable) {
  const findings = outcome.inline().map((finding) => {
    const range = finding.lines().toContract();
    return `- \`${finding.path().toContract()}:${range.start}-${range.end}\` (${finding.side().toContract()}): ${finding.body().toContract()}`;
  });
  const sections = [
    outcome.summary().toContract(),
    ...(findings.length === 0 ? [] : [findings.join('\n')]),
    ledgerTable,
  ];
  return `${sections.join('\n\n')}\n`;
}

export function createGitAdapter(run) {
  return Object.freeze({
    kind: 'git',
    resolve(host) {
      const git = (...args) => run('git', ['-C', host.repository, ...args]);
      const headRaw = git('rev-parse', '--verify', `${host.head}^{commit}`).trim();
      const headCommit = CommitSha.fromRaw(headRaw).unwrap();
      const base = git('merge-base', host.base, headRaw).trim();
      const pullRequest = PullRequest.fromRaw({
        host,
        author: git('log', '-1', '--format=%ae', headRaw).trim(),
        description: git('log', '--format=%B', `${base}..${headRaw}`).trim(),
      }).unwrap();
      return {
        pullRequest,
        headCommit,
        blocked: [],
        prior: null,
        refused: null,
        threads: Threads.fromRaw({ threads: [] }).unwrap(),
        diff: () =>
          ChangeSet.fromDiff(headRaw, git('diff', '--no-color', base, headRaw)).unwrap(),
        changedSince: () => new Map(),
        checkout: (dir) => {
          mkdirSync(dir, { recursive: true });
          const tarball = `${dir}.tar`;
          git('archive', '--format=tar', '-o', tarball, headRaw);
          run('tar', ['-xf', tarball, '-C', dir]);
          return Checkout.fromRaw(dir).unwrap();
        },
      };
    },
    refuse(_host, headCommit, reasons) {
      return `not reviewed at ${headCommit.toContract()}: ${reasons.join('; ')}`;
    },
    post(_host, outcome, ledgerTable, workdir) {
      const file = writeTextFile(join(workdir, 'review.md'), renderGitReview(outcome, ledgerTable));
      return { review: file, inline: outcome.inline().length };
    },
  });
}

export const gitAdapter = createGitAdapter(runCommand);
