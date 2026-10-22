import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { LineRange } from './line-range.mjs';
import { Lines, NumberedLines, RemovedLines, Side } from './lines.mjs';
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

describe('Side, NumberedLines, RemovedLines, and Lines', () => {
  test('Side validates head and base and dispatches exhaustively via match', () => {
    const head = unwrapOk(Side.fromRaw('head'));
    const base = unwrapOk(Side.fromRaw('base'));
    const bad = unwrapErr(Side.fromRaw('middle'));
    const headLabel = head.match({ head: () => 'H', base: () => 'B' });
    const baseLabel = base.match({ head: () => 'H', base: () => 'B' });

    assert.equal(head.equals(Side.HEAD), true);
    assert.equal(base.equals(Side.BASE), true);
    assert.equal(headLabel, 'H');
    assert.equal(baseLabel, 'B');
    assert.equal(bad.includes('Side'), true);
  });

  test('NumberedLines enforces consecutive 1-based line numbers and supports slice checks', () => {
    const lines = unwrapOk(
      NumberedLines.fromRaw({
        20: 'const a = 1;',
        21: 'const b = 2;',
        22: 'const c = 3;',
      }),
    );
    const subSlice = unwrapOk(
      NumberedLines.fromRaw({
        21: 'const b = 2;',
      }),
    );
    const alteredSlice = unwrapOk(
      NumberedLines.fromRaw({
        21: 'const b = 999;',
      }),
    );
    const nonConsecutiveErr = unwrapErr(
      NumberedLines.fromRaw({
        20: 'const a = 1;',
        22: 'const c = 3;',
      }),
    );
    const line21 = unwrapOk(LineNumber.fromRaw(21));
    const text21 = unwrapOk(lines.textAt(line21));
    const subRange = unwrapOk(LineRange.fromRaw({ start: 20, end: 21 }));
    const extracted = unwrapOk(lines.sliceRange(subRange));

    assert.deepEqual(lines.range().toContract(), { start: 20, end: 22 });
    assert.equal(text21.toContract(), 'const b = 2;');
    assert.equal(lines.containsSlice(subSlice), true);
    assert.equal(lines.containsSlice(alteredSlice), false);
    assert.deepEqual(extracted.toContract(), { 20: 'const a = 1;', 21: 'const b = 2;' });
    assert.equal(nonConsecutiveErr.includes('consecutive'), true);
  });

  test('RemovedLines validates range and converts base lines into NumberedLines', () => {
    const removed = unwrapOk(
      RemovedLines.fromRaw({
        start: 10,
        end: 11,
        content: 'old line 10\nold line 11',
      }),
    );
    const numbered = unwrapOk(removed.toNumberedLines());
    const wrapped = unwrapOk(Lines.fromRaw({ 10: 'old line 10' }));
    const kind = wrapped.match({
      numbered: () => 'numbered',
      removed: () => 'removed',
      side: () => 'side',
    });

    assert.deepEqual(removed.range().toContract(), { start: 10, end: 11 });
    assert.deepEqual(numbered.toContract(), { 10: 'old line 10', 11: 'old line 11' });
    assert.equal(kind, 'numbered');
  });
});
