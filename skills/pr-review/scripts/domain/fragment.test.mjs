import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ContextFragment, Fragment, SurfaceFragment } from './fragment.mjs';
import { NumberedLines, Side } from './lines.mjs';

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

describe('SurfaceFragment, ContextFragment, and Fragment', () => {
  test('SurfaceFragment validates kind, side, and consecutive lines and checks anchor slices', () => {
    const raw = {
      kind: 'surface',
      side: 'head',
      lines: {
        21: 'const x = 1;',
        22: 'const y = 2;',
      },
    };
    const frag = unwrapOk(SurfaceFragment.fromRaw(raw));
    const slice = unwrapOk(NumberedLines.fromRaw({ 21: 'const x = 1;' }));
    const wrongSlice = unwrapOk(NumberedLines.fromRaw({ 21: 'const x = 9;' }));

    assert.equal(Object.isFrozen(frag), true);
    assert.equal(frag.side().equals(Side.HEAD), true);
    assert.equal(frag.containsAnchorSlice(Side.HEAD, slice), true);
    assert.equal(frag.containsAnchorSlice(Side.BASE, slice), false);
    assert.equal(frag.containsAnchorSlice(Side.HEAD, wrongSlice), false);
    assert.deepEqual(frag.toContract(), raw);
  });

  test('ContextFragment validates kind and lines and rejects extra fields', () => {
    const raw = {
      kind: 'context',
      lines: {
        20: 'import assert from "node:assert/strict";',
      },
    };
    const frag = unwrapOk(ContextFragment.fromRaw(raw));
    const badErr = unwrapErr(
      ContextFragment.fromRaw({
        kind: 'surface',
        lines: { 20: 'x' },
      }),
    );

    assert.equal(Object.isFrozen(frag), true);
    assert.deepEqual(frag.toContract(), raw);
    assert.equal(badErr.includes('ContextFragment'), true);
  });

  test('Fragment sum type dispatches exhaustively between surface and context', () => {
    const surf = unwrapOk(
      Fragment.fromRaw({
        kind: 'surface',
        side: 'base',
        lines: { 10: 'old()' },
      }),
    );
    const ctx = unwrapOk(
      Fragment.fromRaw({
        kind: 'context',
        lines: { 9: 'keep()' },
      }),
    );
    const surfTag = surf.match({
      surface: (s) => `surface:${s.side().toContract()}`,
      context: () => 'context',
    });
    const ctxTag = ctx.match({
      surface: () => 'surface',
      context: (c) => `context:${c.lines().range().start().toContract()}`,
    });

    assert.equal(surfTag, 'surface:base');
    assert.equal(ctxTag, 'context:9');
  });
});
