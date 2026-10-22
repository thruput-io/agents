import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ChangedPath, LineNumber } from './primitives.mjs';
import { Thread, Threads } from './threads.mjs';

describe('Thread and Threads', () => {
  it('identifies our review comments and aggregates active ranges by side', () => {
    assert.equal(
      Thread.isOurs('Observation breaks [Fail fast](https://thruput.se/agents/#fail-fast)'),
      true,
    );
    assert.equal(Thread.isOurs('Looks good to me!'), false);

    const threads = Threads.fromRaw({
      threads: [
        {
          id: 't1',
          path: 'scripts/verify.sh',
          side: 'head',
          lines: { start: 10, end: 12 },
          state: 'open',
          body: 'Obs breaks [Fail fast](https://thruput.se/agents/#fail-fast)',
        },
        {
          id: 't2',
          path: 'scripts/verify.sh',
          side: 'head',
          lines: { start: 13, end: 15 },
          state: 'resolved-by-author',
          body: 'Obs2 breaks [Fail fast](https://thruput.se/agents/#fail-fast)',
        },
        {
          id: 't3',
          path: 'scripts/verify.sh',
          side: 'base',
          lines: { start: 5, end: 5 },
          state: 'resolved',
          body: 'Resolved by someone else',
        },
      ],
    }).unwrap();

    const active = threads.activeRangesBySide();
    assert.deepEqual(
      active.head.get('scripts/verify.sh').map((r) => r.toContract()),
      [{ start: 10, end: 15 }],
    );
    assert.equal(active.base.has('scripts/verify.sh'), false);

    const path = ChangedPath.fromRaw('scripts/verify.sh').unwrap();
    const line12 = LineNumber.fromRaw(12).unwrap();
    assert.equal(
      threads.anyCarriesFinding(path, line12, '[Fail fast](https://thruput.se/agents/#fail-fast)'),
      true,
    );
  });
});
