import { z } from 'zod';
import { SCHEMAS } from './contracts.mjs';
import { ContextFragment, Fragment, SurfaceFragment } from './fragment.mjs';
import { LineRange } from './line-range.mjs';
import { NumberedLines, Side } from './lines.mjs';
import { ChangedPath, LineNumber } from './primitives.mjs';
import { Result } from './result.mjs';

const surfaceSchema = z.fromJSONSchema(SCHEMAS['surface.schema.json']);
const surfaceToken = Symbol('Surface');
const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function splitFileLines(text) {
  const raw = text.split('\n');
  return raw.at(-1) === '' ? raw.slice(0, -1) : raw;
}

function groupHeadLinesByRanges(linesArray, addedRanges) {
  const runs = linesArray.reduce((acc, text, idx) => {
    const lineNum = idx + 1;
    const isAdded = addedRanges.some(
      (r) => r.start().toContract() <= lineNum && lineNum <= r.end().toContract(),
    );
    const kind = isAdded ? 'surface' : 'context';
    const last = acc.at(-1);
    if (last && last.kind === kind) {
      return [...acc.slice(0, -1), { ...last, lines: { ...last.lines, [String(lineNum)]: text } }];
    }
    return [...acc, { kind, lines: { [String(lineNum)]: text } }];
  }, []);
  return Result.collect(
    runs.map((run) =>
      run.kind === 'surface'
        ? NumberedLines.fromRaw(run.lines).flatMap((nl) =>
            SurfaceFragment.create(Side.HEAD, nl).map((sf) => Fragment.fromSurface(sf)),
          )
        : NumberedLines.fromRaw(run.lines).flatMap((nl) =>
            ContextFragment.create(nl).map((cf) => Fragment.fromContext(cf)),
          ),
    ),
  );
}

function appendDiffEntry(runs, side, lineNum, text) {
  const last = runs.at(-1);
  if (last && last.side === side && last.lastLine === lineNum - 1) {
    return [
      ...runs.slice(0, -1),
      { side, lastLine: lineNum, lines: { ...last.lines, [String(lineNum)]: text } },
    ];
  }
  return [...runs, { side, lastLine: lineNum, lines: { [String(lineNum)]: text } }];
}

function parseUnifiedDiffRuns(patchText) {
  const finalState = patchText.split('\n').reduce(
    (state, line) => {
      const match = HUNK_HEADER.exec(line);
      if (match) return { ...state, oldLine: Number(match[1]), newLine: Number(match[2]) };
      if (line.startsWith('+') && !line.startsWith('+++')) {
        return {
          ...state,
          newLine: state.newLine + 1,
          headRuns: appendDiffEntry(state.headRuns, 'head', state.newLine, line.slice(1)),
        };
      }
      if (line.startsWith('-') && !line.startsWith('---')) {
        return {
          ...state,
          oldLine: state.oldLine + 1,
          baseRuns: appendDiffEntry(state.baseRuns, 'base', state.oldLine, line.slice(1)),
        };
      }
      if (line.startsWith(' ')) {
        return { ...state, oldLine: state.oldLine + 1, newLine: state.newLine + 1 };
      }
      return state;
    },
    { oldLine: 0, newLine: 0, headRuns: [], baseRuns: [] },
  );
  return [...finalState.headRuns, ...finalState.baseRuns];
}

export class Surface {
  #path;
  #fragments;
  constructor(guard, path, fragments) {
    if (guard !== surfaceToken) throw new Error('Use Surface factory methods to construct Surface');
    this.#path = path;
    this.#fragments = Object.freeze([...fragments]);
    Object.freeze(this);
  }
  static create(path, fragments) {
    if (!(path instanceof ChangedPath)) return Result.err('Surface: path must be ChangedPath');
    if (!Array.isArray(fragments) || fragments.length === 0) {
      return Result.err('Surface: requires at least one Fragment');
    }
    return Result.ok(new Surface(surfaceToken, path, fragments));
  }
  static fromRaw(raw) {
    return Result.fromZod(surfaceSchema, raw, (v) => v).flatMap((validated) =>
      ChangedPath.fromRaw(validated.path).flatMap((path) =>
        Result.collect(validated.fragments.map((f) => Fragment.fromRaw(f))).flatMap((fragments) =>
          Surface.create(path, fragments),
        ),
      ),
    );
  }
  static fromFileLinesAndChanges(path, headText, addedRanges, removedBlocks) {
    const headLines = splitFileLines(headText);
    const headFragmentsResult =
      headLines.length === 0 ? Result.ok([]) : groupHeadLinesByRanges(headLines, addedRanges);
    const baseFragmentsResult = Result.collect(
      removedBlocks.map((block) =>
        block.toNumberedLines().flatMap((nl) =>
          SurfaceFragment.create(Side.BASE, nl).map((sf) => Fragment.fromSurface(sf)),
        ),
      ),
    );
    return headFragmentsResult.flatMap((headFrags) =>
      baseFragmentsResult.flatMap((baseFrags) =>
        Surface.create(path, [...headFrags, ...baseFrags]),
      ),
    );
  }
  static fromWholeFile(path, headText) {
    const headLines = splitFileLines(headText);
    return LineNumber.fromRaw(1).flatMap((start) =>
      LineNumber.fromRaw(Math.max(1, headLines.length)).flatMap((end) =>
        LineRange.fromNumbers(start, end).flatMap((range) =>
          Surface.fromFileLinesAndChanges(path, headText, [range], []),
        ),
      ),
    );
  }
  static fromUnifiedDiff(path, patchText) {
    return Result.collect(
      parseUnifiedDiffRuns(patchText).map((run) =>
        Side.fromRaw(run.side).flatMap((side) =>
          NumberedLines.fromRaw(run.lines).flatMap((nl) =>
            SurfaceFragment.create(side, nl).map((sf) => Fragment.fromSurface(sf)),
          ),
        ),
      ),
    ).flatMap((fragments) => Surface.create(path, fragments));
  }
  extractContextFragments(wholeSurface, margin) {
    const wholeLinesMap = Object.assign({}, ...wholeSurface.fragments().map((f) => f.toContract().lines));
    const totalLines = Object.keys(wholeLinesMap).length;
    const headSurfFrags = this.#fragments.filter((f) => f.match({ surface: (sf) => sf.side().equals(Side.HEAD), context: () => false }));
    const baseSurfFrags = this.#fragments.filter((f) => f.match({ surface: (sf) => sf.side().equals(Side.BASE), context: () => false }));
    const interleaved = headSurfFrags.flatMap((frag, idx) => {
      const nums = Object.keys(frag.toContract().lines).map(Number);
      const start = Math.min(...nums);
      const end = Math.max(...nums);
      const bStart = Math.max(1, start - margin);
      const beforeEntries = Array.from({ length: Math.max(0, start - bStart) }, (_, i) => [String(bStart + i), wholeLinesMap[String(bStart + i)]]);
      const aEnd = Math.min(totalLines, end + margin);
      const afterEntries = idx === headSurfFrags.length - 1 ? Array.from({ length: Math.max(0, aEnd - end) }, (_, i) => [String(end + 1 + i), wholeLinesMap[String(end + 1 + i)]]) : [];
      return [
        ...(beforeEntries.length > 0 ? [{ kind: 'context', lines: Object.fromEntries(beforeEntries) }] : []),
        frag.toContract(),
        ...(afterEntries.length > 0 ? [{ kind: 'context', lines: Object.fromEntries(afterEntries) }] : []),
      ];
    });
    return Surface.fromRaw({ path: this.#path.toContract(), fragments: [...interleaved, ...baseSurfFrags.map((f) => f.toContract())] });
  }
  path() {
    return this.#path;
  }
  fragments() {
    return this.#fragments;
  }
  containsAnchorSlice(side, numberedLines) {
    return this.#fragments.some((fragment) =>
      fragment.match({
        surface: (sf) => sf.containsAnchorSlice(side, numberedLines),
        context: () => false,
      }),
    );
  }
  toContract() {
    return { path: this.#path.toContract(), fragments: this.#fragments.map((f) => f.toContract()) };
  }
}
