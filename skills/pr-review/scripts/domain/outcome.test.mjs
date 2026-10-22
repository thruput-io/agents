import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CONSTANTS } from './contracts.mjs';
import { AgentInstructions } from './agent-instructions.mjs';
import { Ledger } from './ledger.mjs';
import { Outcome } from './outcome.mjs';
import { Threads } from './threads.mjs';

const SHA = 'e2bde7afe2f2b1ffc23cdb6f0dc00601b4868eb7';

const INSTRUCTIONS = AgentInstructions.fromRaw({
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
        fragments: [{ kind: 'surface', side: 'head', lines: { 21: 'lychee "$site" | tail -n 1' } }],
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

describe('Outcome', () => {
  it('computes inline findings, settle, and reopen lists from verified entries and threads', () => {
    const ledger = Ledger.fromRaw({
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

    const threads = Threads.fromRaw({
      threads: [
        {
          id: 'open-fixed',
          path: 'scripts/verify.sh',
          side: 'head',
          lines: { start: 10, end: 10 },
          state: 'open',
          body: 'Old finding breaks [Fail fast](https://thruput.se/agents/#fail-fast)',
        },
        {
          id: 'resolved-still-broken',
          path: 'scripts/verify.sh',
          side: 'head',
          lines: { start: 21, end: 21 },
          state: 'resolved-by-author',
          body: 'Suppressing exit status breaks [Fail fast](https://thruput.se/agents/#fail-fast)',
        },
      ],
    }).unwrap();

    const { outcome } = Outcome.fromVerifiedEntries(
      [{ instructions: INSTRUCTIONS, ledger }],
      threads,
    ).unwrap();

    assert.deepEqual(outcome.toContract(), {
      headCommit: SHA,
      verdict: 'request-changes',
      summary:
        '**Verdict: request-changes**\n\n1 rules probed by 1 probes at e2bde7afe2f2b1ffc23cdb6f0dc00601b4868eb7 against [the rules](https://thruput.se/agents/): 1 violations, 0 inline, 0 at the pull request, 1 already carried by a thread.',
      inline: [],
      settle: ['open-fixed'],
      reopen: ['resolved-still-broken'],
    });
  });
});
