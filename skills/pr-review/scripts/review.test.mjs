import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { writeDomainJson, writeDomainYaml } from './adapters/fs-store.mjs';
import { AgentInstructions } from './domain/agent-instructions.mjs';
import { Ledger } from './domain/ledger.mjs';
import { PullRequest } from './domain/pull-request.mjs';
import { Threads } from './domain/threads.mjs';
import { runReview } from './review.mjs';

const SHA = 'e2bde7afe2f2b1ffc23cdb6f0dc00601b4868eb7';

const sampleRulebook = {
  rules: [
    {
      id: 'Delete unused',
      marker: 'MUST',
      group: 'Dead Code',
      parent: 'Code Is a Liability',
      body: 'Delete unused code.',
    },
  ],
  principles: [
    {
      id: 'Code Is a Liability',
      parent: 'Great Code',
      body: 'Every line costs maintenance.',
    },
  ],
  definitions: [],
};

describe('review CLI entrypoint', () => {
  it('merges verified probe ledgers, writes ledger.json/ledger.md/outcome.json, and posts via host adapter', () => {
    const dir = mkdtempSync(join(tmpdir(), 'review-test-'));
    try {
      const pr = PullRequest.fromRaw({
        host: { kind: 'github', owner: 'thruput-io', repository: 'agents', number: 12 },
        author: 'dev',
        description: 'PR description',
      }).unwrap();
      writeDomainJson(join(dir, 'pull-request.json'), pr);
      writeDomainJson(join(dir, 'threads.json'), Threads.fromRaw({ threads: [] }).unwrap());

      const ledgerPath = join(dir, 'ledger', '01-dead-code.json');
      const instructionsPath = join(dir, 'instructions', '01-dead-code.yaml');
      const instructions = AgentInstructions.fromRaw({
        kind: 'dead-code',
        checkout: '/tmp/checkout',
        rulebook: sampleRulebook,
        review: {
          pullRequest: pr.toContract(),
          headCommit: SHA,
          files: [
            {
              path: 'src/a.mjs',
              fragments: [{ kind: 'surface', side: 'head', lines: { '1': 'const a = 1;' } }],
            },
          ],
          ledger: ledgerPath,
          report: `node "/path/check.mjs" "${instructionsPath}"`,
        },
      }).unwrap();
      writeDomainYaml(instructionsPath, instructions);

      const fakeAdapter = {
        kind: 'github',
        post: (_host, outcome) => ({
          review: 'https://github.com/thruput-io/agents/pull/12#pullrequestreview-1',
          posted: true,
          inline: outcome.inline().length,
          settled: 0,
          reopened: 0,
        }),
      };

      assert.throws(() => runReview(dir, [fakeAdapter]), /no ledger from: 01-dead-code/);

      const ledger = Ledger.fromRaw({
        headCommit: SHA,
        rows: [
          {
            rule: 'Delete unused',
            examined: ['src/a.mjs:1-1'],
            verdict: 'violation',
            evidence: 'Unused constant a.',
            violations: [
              {
                observation: 'const a is never referenced.',
                anchor: {
                  kind: 'surface',
                  path: 'src/a.mjs',
                  side: 'head',
                  lines: { '1': 'const a = 1;' },
                },
              },
            ],
          },
        ],
      }).unwrap();
      writeDomainJson(ledgerPath, ledger);

      const summary = runReview(dir, [fakeAdapter]);
      assert.equal(summary.verdict, 'request-changes');
      assert.equal(summary.rows, 1);
      assert.equal(summary.inline, 1);
      assert.equal(existsSync(join(dir, 'ledger.json')), true);
      assert.equal(existsSync(join(dir, 'outcome.json')), true);
      assert.equal(readFileSync(join(dir, 'ledger.md'), 'utf8').includes('Delete unused'), true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
