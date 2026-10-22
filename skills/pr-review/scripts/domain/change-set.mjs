import { z } from 'zod';
import { DEFS, SCHEMAS } from '../.generated/contracts.mjs';
import { LineRange } from './line-range.mjs';
import { RemovedLines } from './lines.mjs';
import { ChangedPath, CommitSha } from './primitives.mjs';
import { Result } from './result.mjs';

const changedFileSchema = z.fromJSONSchema(DEFS['change-set.schema.json#/$defs/ChangedFile']);
const changeSetSchema = z.fromJSONSchema(SCHEMAS['change-set.schema.json']);
const fileToken = Symbol('ChangedFile');
const setToken = Symbol('ChangeSet');
const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function appendAdded(ranges, line) {
  const last = ranges.at(-1);
  if (last !== undefined && last.end === line - 1) {
    return [...ranges.slice(0, -1), { start: last.start, end: line }];
  }
  return [...ranges, { start: line, end: line }];
}

function appendRemoved(ranges, line, text) {
  const last = ranges.at(-1);
  if (last !== undefined && last.end === line - 1) {
    return [...ranges.slice(0, -1), { start: last.start, end: line, content: `${last.content}\n${text}` }];
  }
  return [...ranges, { start: line, end: line, content: text }];
}

export function parseHunkLines(lines) {
  const state = lines.reduce(
    (acc, line) => {
      const hunk = HUNK.exec(line);
      if (hunk !== null) return { ...acc, oldLine: Number(hunk[1]), newLine: Number(hunk[2]) };
      if (line.startsWith('+')) {
        return { ...acc, newLine: acc.newLine + 1, added: appendAdded(acc.added, acc.newLine) };
      }
      if (line.startsWith('-')) {
        return {
          ...acc,
          oldLine: acc.oldLine + 1,
          removed: appendRemoved(acc.removed, acc.oldLine, line.slice(1)),
        };
      }
      if (line.startsWith(' ')) return { ...acc, oldLine: acc.oldLine + 1, newLine: acc.newLine + 1 };
      return acc;
    },
    { oldLine: 0, newLine: 0, added: [], removed: [] },
  );
  return { added: state.added, removed: state.removed };
}

function headerPath(headerLines, prefix) {
  const found = headerLines.find((line) => line.startsWith(prefix));
  const raw = found === undefined ? '/dev/null' : found.slice(prefix.length).split('\t')[0];
  return raw === '/dev/null' ? undefined : raw.replace(/^[ab]\//, '');
}

function parseDiffSections(diffText) {
  return diffText
    .split(/^(?=diff --git )/m)
    .filter((section) => section.startsWith('diff --git '))
    .flatMap((section) => {
      const lines = section.split('\n');
      const start = lines.findIndex((line) => HUNK.test(line));
      const header = start === -1 ? lines : lines.slice(0, start);
      const oldPath = headerPath(header, '--- ');
      const newPath = headerPath(header, '+++ ');
      const chosenPath = newPath !== undefined ? newPath : oldPath;
      if (chosenPath === undefined) return [];
      const body = start === -1 ? [] : lines.slice(start);
      return [{ path: chosenPath, ...parseHunkLines(body) }];
    });
}

function sliceRemovedHunks(hunks, ranges) {
  return Result.collect(
    ranges.map((range) => {
      const r = range.toContract();
      const hunk = hunks
        .map((h) => h.toContract())
        .find((candidate) => candidate.start <= r.start && r.end <= candidate.end);
      if (hunk === undefined) return Result.err(`no removed hunk holds lines ${r.start}-${r.end}`);
      const content = hunk.content
        .split('\n')
        .slice(r.start - hunk.start, r.end - hunk.start + 1)
        .join('\n');
      return RemovedLines.fromRaw({ start: r.start, end: r.end, content });
    }),
  );
}

export class ChangedFile {
  #path;
  #added;
  #removed;
  constructor(guard, path, added, removed) {
    if (guard !== fileToken) throw new Error('Use ChangedFile.fromRaw to construct ChangedFile');
    this.#path = path;
    this.#added = Object.freeze([...added]);
    this.#removed = Object.freeze([...removed]);
    Object.freeze(this);
  }
  static fromRaw(raw) {
    return Result.fromZod(changedFileSchema, raw, (v) => v).flatMap((v) =>
      ChangedPath.fromRaw(v.path).flatMap((path) =>
        Result.collect(v.added.map((a) => LineRange.fromRaw(a))).flatMap((added) =>
          Result.collect(v.removed.map((r) => RemovedLines.fromRaw(r))).map(
            (removed) => new ChangedFile(fileToken, path, added, removed),
          ),
        ),
      ),
    );
  }
  path() {
    return this.#path;
  }
  added() {
    return this.#added;
  }
  removed() {
    return this.#removed;
  }
  toContract() {
    return {
      path: this.#path.toContract(),
      added: this.#added.map((a) => a.toContract()),
      removed: this.#removed.map((r) => r.toContract()),
    };
  }
}

export class ChangeSet {
  #headCommit;
  #files;
  constructor(guard, headCommit, files) {
    if (guard !== setToken) throw new Error('Use ChangeSet.fromRaw to construct ChangeSet');
    this.#headCommit = headCommit;
    this.#files = Object.freeze([...files]);
    Object.freeze(this);
  }
  static fromRaw(raw) {
    return Result.fromZod(changeSetSchema, raw, (v) => v).flatMap((v) =>
      CommitSha.fromRaw(v.headCommit).flatMap((headCommit) =>
        Result.collect(v.files.map((f) => ChangedFile.fromRaw(f))).map(
          (files) => new ChangeSet(setToken, headCommit, files),
        ),
      ),
    );
  }
  static fromDiff(headCommit, diffText) {
    return ChangeSet.fromRaw({ headCommit, files: parseDiffSections(diffText) });
  }
  headCommit() {
    return this.#headCommit;
  }
  files() {
    return this.#files;
  }
  totalAddedLines() {
    return this.#files.reduce((sum, f) => sum + f.added().reduce((n, r) => n + r.span(), 0), 0);
  }
  totalRemovedLines() {
    return this.#files.reduce((sum, f) => sum + f.removed().reduce((n, r) => n + r.range().span(), 0), 0);
  }
  narrowTo(changedSinceMap, threadSides) {
    return Result.collect(
      this.#files.map((file) => {
        const key = file.path().toContract();
        const since = changedSinceMap.has(key) ? changedSinceMap.get(key) : [];
        const headThreads = threadSides.head.has(key) ? threadSides.head.get(key) : [];
        const baseThreads = threadSides.base.has(key) ? threadSides.base.get(key) : [];
        const added = LineRange.intersect(file.added(), LineRange.union(since, headThreads));
        const removedRanges = LineRange.intersect(
          file.removed().map((r) => r.range()),
          baseThreads,
        );
        return sliceRemovedHunks(file.removed(), removedRanges).map(
          (removed) => new ChangedFile(fileToken, file.path(), added, removed),
        );
      }),
    ).map(
      (narrowed) =>
        new ChangeSet(
          setToken,
          this.#headCommit,
          narrowed.filter((f) => f.added().length + f.removed().length > 0),
        ),
    );
  }
  toContract() {
    return {
      headCommit: this.#headCommit.toContract(),
      files: this.#files.map((f) => f.toContract()),
    };
  }
}
