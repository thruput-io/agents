import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { writeDomainJson, writeDomainYaml } from './adapters/fs-store.mjs';
import { check } from './check.mjs';
import { AgentInstructions } from './domain/agent-instructions.mjs';
import { Ledger } from './domain/ledger.mjs';

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

describe('check CLI entrypoint', () => {
  it('validates a probe instructions YAML and its recorded Ledger JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'check-test-'));
    try {
      const ledgerPath = join(dir, 'ledger', '01-dead-code.json');
      const instructionsPath = join(dir, 'instructions', '01-dead-code.yaml');
      const instructions = AgentInstructions.fromRaw({
        kind: 'dead-code',
        checkout: '/tmp/checkout',
        rulebook: sampleRulebook,
        review: {
          pullRequest: {
            host: { kind: 'github', owner: 'thruput-io', repository: 'agents', number: 12 },
            author: 'dev',
            description: 'desc',
          },
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
      assert.throws(() => check(instructionsPath), /01-dead-code: no ledger at/);

      const ledger = Ledger.fromRaw({
        headCommit: SHA,
        rows: [
          {
            rule: 'Delete unused',
            examined: ['src/a.mjs:1-1'],
            verdict: 'clean',
            evidence: 'Used in export.',
          },
        ],
      }).unwrap();
      writeDomainJson(ledgerPath, ledger);

      const verified = check(instructionsPath);
      assert.equal(verified.name, '01-dead-code');
      assert.equal(verified.ledger.verdict(), 'approve');
      assert.equal(verified.instructions.kind(), 'dead-code');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
