import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { LineRange } from './line-range.mjs';
import { NumberedLines, RemovedLines, Side } from './lines.mjs';
import { ChangedPath } from './primitives.mjs';
import { Surface } from './surface.mjs';

function unwrapOk(result) {
  return result.match({
    ok: (value) => value,
    err: (error) => {
      throw new Error(`Expected Ok, got Err: ${error}`);
    },
  });
}

describe('Surface', () => {
  test('fromRaw validates against surface schema and checks anchor membership', () => {
    const raw = {
      path: 'scripts/verify.sh',
      fragments: [
        {
          kind: 'context',
          lines: { 20: 'line 20' },
        },
        {
          kind: 'surface',
          side: 'head',
          lines: { 21: 'new line 21' },
        },
        {
          kind: 'surface',
          side: 'base',
          lines: { 21: 'old line 21' },
        },
      ],
    };
    const surface = unwrapOk(Surface.fromRaw(raw));
    const headAnchorLines = unwrapOk(NumberedLines.fromRaw({ 21: 'new line 21' }));
    const contextLines = unwrapOk(NumberedLines.fromRaw({ 20: 'line 20' }));

    assert.equal(Object.isFrozen(surface), true);
    assert.equal(surface.path().toContract(), 'scripts/verify.sh');
    assert.equal(surface.containsAnchorSlice(Side.HEAD, headAnchorLines), true);
    assert.equal(surface.containsAnchorSlice(Side.HEAD, contextLines), false);
    assert.deepEqual(surface.toContract(), raw);
  });

  test('fromFileLinesAndChanges partitions head file into context and surface fragments and appends base removed fragments', () => {
    const path = unwrapOk(ChangedPath.fromRaw('scripts/verify.sh'));
    const addedRange = unwrapOk(LineRange.fromRaw({ start: 2, end: 2 }));
    const removedBlock = unwrapOk(
      RemovedLines.fromRaw({ start: 2, end: 2, content: 'old line 2' }),
    );
    const surface = unwrapOk(
      Surface.fromFileLinesAndChanges(
        path,
        'line 1\nnew line 2\nline 3\n',
        [addedRange],
        [removedBlock],
      ),
    );

    assert.deepEqual(surface.toContract(), {
      path: 'scripts/verify.sh',
      fragments: [
        { kind: 'context', lines: { 1: 'line 1' } },
        { kind: 'surface', side: 'head', lines: { 2: 'new line 2' } },
        { kind: 'context', lines: { 3: 'line 3' } },
        { kind: 'surface', side: 'base', lines: { 2: 'old line 2' } },
      ],
    });
  });

  test('fromWholeFile and fromUnifiedDiff build Surface and extractContextFragments extracts surrounding context', () => {
    const path = unwrapOk(ChangedPath.fromRaw('src/app.mjs'));
    const whole = unwrapOk(
      Surface.fromWholeFile(path, 'line 1\nline 2\nline 3\nline 4\nline 5\n'),
    );
    const diffSurface = unwrapOk(
      Surface.fromUnifiedDiff(
        path,
        ['@@ -3,1 +3,1 @@', '-old 3', '+line 3'].join('\n'),
      ),
    );
    const withContext = unwrapOk(diffSurface.extractContextFragments(whole, 1));

    assert.equal(whole.fragments().length, 1);
    assert.equal(diffSurface.fragments().length, 2);
    assert.deepEqual(withContext.toContract(), {
      path: 'src/app.mjs',
      fragments: [
        { kind: 'context', lines: { 2: 'line 2' } },
        { kind: 'surface', side: 'head', lines: { 3: 'line 3' } },
        { kind: 'context', lines: { 4: 'line 4' } },
        { kind: 'surface', side: 'base', lines: { 3: 'old 3' } },
      ],
    });
  });
});
