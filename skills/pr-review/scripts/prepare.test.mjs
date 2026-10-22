import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ChangeSet } from './domain/change-set.mjs';
import { Checkout } from './domain/checkout.mjs';
import { CommitSha } from './domain/primitives.mjs';
import { PullRequest } from './domain/pull-request.mjs';
import { Threads } from './domain/threads.mjs';
import { prepareWorkspace } from './prepare.mjs';

const SHA = 'e2bde7afe2f2b1ffc23cdb6f0dc00601b4868eb7';
const skillDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('prepare CLI entrypoint', () => {
  it('prepares workspace files and probe instructions without file-size refusal', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'prepare-test-'));
    try {
      const pr = PullRequest.fromRaw({
        host: { kind: 'github', owner: 'thruput-io', repository: 'agents', number: 12 },
        author: 'dev',
        description: 'PR description',
      }).unwrap();
      const headCommit = CommitSha.fromRaw(SHA).unwrap();
      const diffText = [
        'diff --git a/src/a.mjs b/src/a.mjs',
        '--- a/src/a.mjs',
        '+++ b/src/a.mjs',
        '@@ -1,1 +1,2 @@',
        ' const x = 1;',
        '+const y = 2;',
      ].join('\n');
      const fakeAdapter = {
        kind: 'github',
        resolve: () => ({
          pullRequest: pr,
          headCommit,
          blocked: [],
          prior: null,
          refused: null,
          threads: Threads.fromRaw({ threads: [] }).unwrap(),
          diff: () => ChangeSet.fromDiff(SHA, diffText).unwrap(),
          changedSince: () => new Map(),
          checkout: (snapshotDir) => {
            mkdirSync(join(snapshotDir, 'src'), { recursive: true });
            writeFileSync(join(snapshotDir, 'src', 'a.mjs'), 'const x = 1;\nconst y = 2;\n', 'utf8');
            return Checkout.fromRaw(snapshotDir).unwrap();
          },
        }),
        refuse: () => 'https://github.com/thruput-io/agents/pull/12#refused',
      };
      const fakeFetchText = async () => '### Use strict equality\nAlways use ===.';

      const summary = await prepareWorkspace(
        'https://github.com/thruput-io/agents/pull/12',
        dir,
        skillDir,
        [fakeAdapter],
        fakeFetchText,
      );
      assert.equal(summary.host, 'github');
      assert.equal(summary.headCommit, SHA);
      assert.equal(summary.changeSet.files, 1);
      assert.equal(summary.surface.files, 1);
      assert.equal(existsSync(join(dir, 'pull-request.json')), true);
      assert.equal(existsSync(join(dir, 'change-set.json')), true);
      assert.equal(existsSync(join(dir, 'threads.json')), true);
      assert.equal(existsSync(join(dir, 'summary.json')), true);
      assert.equal(summary.probes.length > 0, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
