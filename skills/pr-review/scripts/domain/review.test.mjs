import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NumberedLines, Side } from './lines.mjs';
import { ChangedPath } from './primitives.mjs';
import { Review } from './review.mjs';

const SHA = 'e2bde7afe2f2b1ffc23cdb6f0dc00601b4868eb7';

describe('Review', () => {
  it('validates Review contract and checks surface anchor slices against files', () => {
    const raw = {
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
            { kind: 'surface', side: 'head', lines: { 21: 'lychee "$site"' } },
          ],
        },
      ],
      ledger: '/tmp/work/ledger/01.json',
      report: 'node check.mjs /tmp/work/instructions/01.yaml',
    };

    const review = Review.fromRaw(raw).unwrap();
    assert.deepEqual(review.toContract(), raw);
    const path = ChangedPath.fromRaw('scripts/verify.sh').unwrap();
    const surfaceSlice = NumberedLines.fromRaw({ 21: 'lychee "$site"' }).unwrap();
    const contextSlice = NumberedLines.fromRaw({ 20: 'echo before' }).unwrap();
    assert.equal(review.containsSurfaceSlice(path, Side.HEAD, surfaceSlice), true);
    assert.equal(review.containsSurfaceSlice(path, Side.HEAD, contextSlice), false);
  });
});
