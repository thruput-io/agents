import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Review } from './review.mjs';
import { Anchor, Violation } from './violation.mjs';

const SHA = 'e2bde7afe2f2b1ffc23cdb6f0dc00601b4868eb7';

const SAMPLE_REVIEW = Review.fromRaw({
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
}).unwrap();

describe('Anchor and Violation', () => {
  it('validates surface and pull-request anchors against review surface', () => {
    const surfaceViolation = Violation.fromRaw({
      observation: 'Losing exit status in a pipe',
      anchor: {
        kind: 'surface',
        path: 'scripts/verify.sh',
        side: 'head',
        lines: { 21: 'lychee "$site" | tail -n 1' },
      },
    }).unwrap();
    assert.equal(surfaceViolation.isInsideReview(SAMPLE_REVIEW), true);
    assert.equal(
      surfaceViolation.renderBody('[Fail fast](https://thruput.se/agents/#fail-fast)'),
      'Losing exit status in a pipe breaks [Fail fast](https://thruput.se/agents/#fail-fast)',
    );

    const contextViolation = Violation.fromRaw({
      observation: 'Context line anchor',
      anchor: {
        kind: 'surface',
        path: 'scripts/verify.sh',
        side: 'head',
        lines: { 20: 'echo before' },
      },
    }).unwrap();
    assert.equal(contextViolation.isInsideReview(SAMPLE_REVIEW), false);

    const prAnchor = Anchor.fromRaw({ kind: 'pull-request' }).unwrap();
    assert.equal(prAnchor.isInsideReview(SAMPLE_REVIEW), true);
  });
});
