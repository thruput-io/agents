import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ChangedFile, ChangeSet } from './change-set.mjs';
import { LineRange } from './line-range.mjs';

const SHA = 'e2bde7afe2f2b1ffc23cdb6f0dc00601b4868eb7';

describe('ChangedFile and ChangeSet', () => {
  it('parses unified git diff into ChangeSet with added ranges and removed lines', () => {
    const diff = [
      'diff --git a/scripts/verify.sh b/scripts/verify.sh',
      'index 1111111..2222222 100755',
      '--- a/scripts/verify.sh',
      '+++ b/scripts/verify.sh',
      '@@ -20,3 +20,4 @@',
      ' echo start',
      '-lychee --offline "$site"',
      '+lychee "$site"',
      '+echo done',
      ' echo end',
    ].join('\n');

    const cs = ChangeSet.fromDiff(SHA, diff).unwrap();
    assert.equal(cs.headCommit().toContract(), SHA);
    assert.equal(cs.files().length, 1);
    assert.equal(cs.totalAddedLines(), 2);
    assert.equal(cs.totalRemovedLines(), 1);
    assert.deepEqual(cs.toContract(), {
      headCommit: SHA,
      files: [
        {
          path: 'scripts/verify.sh',
          added: [{ start: 21, end: 22 }],
          removed: [{ start: 21, end: 21, content: 'lychee --offline "$site"' }],
        },
      ],
    });
  });

  it('narrows ChangeSet to lines changed since prior review or covered by active threads', () => {
    const cs = ChangeSet.fromRaw({
      headCommit: SHA,
      files: [
        {
          path: 'src/app.mjs',
          added: [
            { start: 1, end: 4 },
            { start: 10, end: 12 },
          ],
          removed: [{ start: 5, end: 7, content: 'old5\nold6\nold7' }],
        },
      ],
    }).unwrap();

    const changedSince = new Map([
      ['src/app.mjs', [LineRange.fromRaw({ start: 2, end: 3 }).unwrap()]],
    ]);
    const threadSides = {
      head: new Map([['src/app.mjs', [LineRange.fromRaw({ start: 11, end: 12 }).unwrap()]]]),
      base: new Map([['src/app.mjs', [LineRange.fromRaw({ start: 6, end: 7 }).unwrap()]]]),
    };

    const narrowed = cs.narrowTo(changedSince, threadSides).unwrap();
    assert.deepEqual(narrowed.toContract(), {
      headCommit: SHA,
      files: [
        {
          path: 'src/app.mjs',
          added: [
            { start: 2, end: 3 },
            { start: 11, end: 12 },
          ],
          removed: [{ start: 6, end: 7, content: 'old6\nold7' }],
        },
      ],
    });
  });

  it('validates ChangedFile invariants and freezes instances', () => {
    const file = ChangedFile.fromRaw({
      path: 'a.mjs',
      added: [{ start: 1, end: 2 }],
      removed: [],
    }).unwrap();
    assert.equal(Object.isFrozen(file), true);
    assert.equal(ChangedFile.fromRaw({ path: '/abs.mjs', added: [], removed: [] }).isErr, true);
  });
});
