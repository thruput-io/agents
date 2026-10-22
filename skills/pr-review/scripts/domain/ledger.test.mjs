import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CONSTANTS } from '../.generated/contracts.mjs';
import { AgentInstructions } from './agent-instructions.mjs';
import { Ledger } from './ledger.mjs';

const SHA = 'e2bde7afe2f2b1ffc23cdb6f0dc00601b4868eb7';

const RULES_INSTRUCTIONS = AgentInstructions.fromRaw({
  kind: 'rules',
  review: {
    pullRequest: {
      host: { kind: 'github', owner: 'thruput-io', repository: 'agents', number: 12 },
      author: 'agent-rasmus[bot]',
      description: 'Verify runs html-validate.',
    },
    headCommit: SHA,
    files: [
      {
        path: 'scripts/verify.sh',
        fragments: [
          { kind: 'context', lines: { 20: 'echo before' } },
          { kind: 'surface', side: 'head', lines: { 21: 'lychee "$site" | tail -n 1' } },
        ],
      },
    ],
    ledger: '/tmp/work/ledger/01.json',
    report: 'node check.mjs /tmp/work/instructions/01.yaml',
  },
  rulebook: {
    instructions: CONSTANTS.rulebookInstructions,
    rules: [
      {
        id: 'No suppressed exit status',
        marker: 'MUST NOT',
        group: 'Failure Handling',
        parent: 'Fail fast',
        body: "Discard a command's non-zero [[Exit status]] so that a failure passes as success.",
      },
    ],
    principles: [
      {
        id: 'Fail fast',
        parent: "Crash, don't guess",
        body: 'A system fails loudly and at once on an unexpected state.',
      },
    ],
    definitions: [
      {
        id: 'Exit status',
        specification: 'The number a process returns when it ends.',
      },
    ],
  },
}).unwrap();

describe('Ledger', () => {
  it('verifies ledger rows against instructions and renders markdown table', () => {
    const validLedger = Ledger.fromRaw({
      headCommit: SHA,
      rows: [
        {
          rule: 'No suppressed exit status',
          examined: ['scripts/verify.sh'],
          verdict: 'violation',
          evidence: 'scripts/verify.sh:21 pipes into tail',
          violations: [
            {
              observation: 'Suppressing exit status',
              anchor: {
                kind: 'surface',
                path: 'scripts/verify.sh',
                side: 'head',
                lines: { 21: 'lychee "$site" | tail -n 1' },
              },
            },
          ],
        },
      ],
    }).unwrap();

    assert.equal(validLedger.verifyAgainstInstructions('01-failure-handling', RULES_INSTRUCTIONS).isOk, true);
    assert.equal(validLedger.verdict(), 'request-changes');
    assert.equal(validLedger.toMarkdownTable().includes('| No suppressed exit status |'), true);
  });

  it('rejects ledger with mismatched rules or outside-surface anchor', () => {
    const outsideAnchorLedger = Ledger.fromRaw({
      headCommit: SHA,
      rows: [
        {
          rule: 'No suppressed exit status',
          examined: ['scripts/verify.sh'],
          verdict: 'violation',
          evidence: 'scripts/verify.sh:20',
          violations: [
            {
              observation: 'Context line',
              anchor: {
                kind: 'surface',
                path: 'scripts/verify.sh',
                side: 'head',
                lines: { 20: 'echo before' },
              },
            },
          ],
        },
      ],
    }).unwrap();

    const res = outsideAnchorLedger.verifyAgainstInstructions('01-failure-handling', RULES_INSTRUCTIONS);
    assert.equal(res.isErr, true);
    assert.equal(res.unwrapErr().includes('anchored outside the surface'), true);
  });
});
