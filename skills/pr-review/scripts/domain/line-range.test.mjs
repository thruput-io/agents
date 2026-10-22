import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { LineRange } from './line-range.mjs';
import { LineNumber } from './primitives.mjs';

function unwrapOk(result) {
  return result.match({
    ok: (value) => value,
    err: (error) => {
      throw new Error(`Expected Ok, got Err: ${error}`);
    },
  });
}

function unwrapErr(result) {
  return result.match({
    ok: () => {
      throw new Error('Expected Err, got Ok');
    },
    err: (error) => error,
  });
}

describe('LineRange', () => {
  test('fromRaw constructs a frozen LineRange when end >= start and rejects inverted ranges', () => {
    const range = unwrapOk(LineRange.fromRaw({ start: 10, end: 15 }));
    const invertedErr = unwrapErr(LineRange.fromRaw({ start: 15, end: 10 }));

    assert.equal(Object.isFrozen(range), true);
    assert.equal(range.start().toContract(), 10);
    assert.equal(range.end().toContract(), 15);
    assert.equal(range.span(), 6);
    assert.deepEqual(range.toContract(), { start: 10, end: 15 });
    assert.equal(invertedErr.includes('end'), true);
  });

  test('contains, containsRange, and overlaps evaluate line membership and intersection', () => {
    const r1 = unwrapOk(LineRange.fromRaw({ start: 10, end: 20 }));
    const r2 = unwrapOk(LineRange.fromRaw({ start: 12, end: 18 }));
    const r3 = unwrapOk(LineRange.fromRaw({ start: 18, end: 25 }));
    const r4 = unwrapOk(LineRange.fromRaw({ start: 21, end: 30 }));
    const line15 = unwrapOk(LineNumber.fromRaw(15));
    const line9 = unwrapOk(LineNumber.fromRaw(9));

    assert.equal(r1.contains(line15), true);
    assert.equal(r1.contains(line9), false);
    assert.equal(r1.containsRange(r2), true);
    assert.equal(r1.containsRange(r3), false);
    assert.equal(r1.overlaps(r3), true);
    assert.equal(r1.overlaps(r4), false);
  });

  test('isWithinLinesOf and mergeWith combine nearby ranges immutably', () => {
    const first = unwrapOk(LineRange.fromRaw({ start: 10, end: 12 }));
    const second = unwrapOk(LineRange.fromRaw({ start: 15, end: 18 }));
    const far = unwrapOk(LineRange.fromRaw({ start: 30, end: 32 }));
    const merged = unwrapOk(first.mergeWith(second));

    assert.equal(first.isWithinLinesOf(second, 3), true);
    assert.equal(first.isWithinLinesOf(far, 3), false);
    assert.deepEqual(merged.toContract(), { start: 10, end: 18 });
  });
});
