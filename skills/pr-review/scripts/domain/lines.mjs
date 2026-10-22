import { z } from 'zod';
import { DEFS, SCHEMAS } from '../.generated/contracts.mjs';
import { LineRange } from './line-range.mjs';
import { LineNumber, LineText } from './primitives.mjs';
import { Result } from './result.mjs';

const sideSchema = z.fromJSONSchema(DEFS['lines.schema.json#/$defs/Side']);
const numberedLinesSchema = z.fromJSONSchema(DEFS['lines.schema.json#/$defs/NumberedLines']);
const removedLinesSchema = z.fromJSONSchema(DEFS['lines.schema.json#/$defs/RemovedLines']);
const linesSchema = z.fromJSONSchema(SCHEMAS['lines.schema.json']);
const sideToken = Symbol('Side');
const numberedToken = Symbol('NumberedLines');
const removedToken = Symbol('RemovedLines');
const linesToken = Symbol('Lines');

export class Side {
  #value;
  constructor(guard, value) {
    if (guard !== sideToken) throw new Error('Use Side.fromRaw to construct Side');
    this.#value = value;
    Object.freeze(this);
  }
  static HEAD = new Side(sideToken, 'head');
  static BASE = new Side(sideToken, 'base');
  static fromRaw(raw) {
    return Result.fromZod(sideSchema, raw, (v) => (v === 'head' ? Side.HEAD : Side.BASE)).match({
      ok: (s) => Result.ok(s),
      err: (msg) => Result.err(`Side: ${msg}`),
    });
  }
  match(handlers) {
    return this.#value === 'head' ? handlers.head() : handlers.base();
  }
  equals(other) {
    return other instanceof Side && this.#value === other.#value;
  }
  toContract() {
    return this.#value;
  }
}

export class NumberedLines {
  #entries;
  #range;
  #byNumber;
  constructor(guard, entries, range) {
    if (guard !== numberedToken) throw new Error('Use NumberedLines.fromRaw to construct NumberedLines');
    this.#entries = Object.freeze([...entries]);
    this.#range = range;
    this.#byNumber = new Map(entries.map((entry) => [entry.number.toContract(), entry.text]));
    Object.freeze(this);
  }
  static fromRaw(raw) {
    return Result.fromZod(numberedLinesSchema, raw, (v) => v).flatMap((validated) => {
      const sortedPairs = Object.entries(validated)
        .map(([k, v]) => [Number(k), v])
        .sort(([a], [b]) => a - b);
      const isConsecutive = sortedPairs.every(
        ([num], idx) => idx === 0 || num === sortedPairs[idx - 1][0] + 1,
      );
      if (!isConsecutive) return Result.err('NumberedLines: line numbers must be consecutive');
      return Result.collect(
        sortedPairs.map(([num, txt]) =>
          LineNumber.fromRaw(num).flatMap((number) =>
            LineText.fromRaw(txt).map((text) => Object.freeze({ number, text })),
          ),
        ),
      ).flatMap((entries) =>
        LineRange.fromNumbers(entries[0].number, entries[entries.length - 1].number).map(
          (range) => new NumberedLines(numberedToken, entries, range),
        ),
      );
    });
  }
  range() {
    return this.#range;
  }
  entries() {
    return this.#entries;
  }
  textAt(lineNumber) {
    if (!this.#byNumber.has(lineNumber.toContract())) {
      return Result.err(`NumberedLines: line ${lineNumber.toContract()} not present`);
    }
    return Result.ok(this.#byNumber.get(lineNumber.toContract()));
  }
  containsSlice(other) {
    return other.entries().every((entry) => {
      const num = entry.number.toContract();
      return this.#byNumber.has(num) && this.#byNumber.get(num).equals(entry.text);
    });
  }
  sliceRange(subRange) {
    const filtered = this.#entries.filter((entry) => subRange.contains(entry.number));
    if (filtered.length === 0) return Result.err('NumberedLines: sliceRange produced empty lines');
    return NumberedLines.fromRaw(
      Object.fromEntries(
        filtered.map((entry) => [String(entry.number.toContract()), entry.text.toContract()]),
      ),
    );
  }
  equals(other) {
    return (
      other instanceof NumberedLines &&
      this.#entries.length === other.#entries.length &&
      this.#entries.every(
        (e, i) => e.number.equals(other.#entries[i].number) && e.text.equals(other.#entries[i].text),
      )
    );
  }
  toContract() {
    return Object.fromEntries(
      this.#entries.map((entry) => [String(entry.number.toContract()), entry.text.toContract()]),
    );
  }
}

export class RemovedLines {
  #range;
  #content;
  constructor(guard, range, content) {
    if (guard !== removedToken) throw new Error('Use RemovedLines.fromRaw to construct RemovedLines');
    this.#range = range;
    this.#content = content;
    Object.freeze(this);
  }
  static fromRaw(raw) {
    return Result.fromZod(removedLinesSchema, raw, (v) => v).flatMap((validated) =>
      LineRange.fromRaw({ start: validated.start, end: validated.end }).map(
        (range) => new RemovedLines(removedToken, range, validated.content),
      ),
    );
  }
  range() {
    return this.#range;
  }
  content() {
    return this.#content;
  }
  toNumberedLines() {
    const startNum = this.#range.start().toContract();
    const span = this.#range.span();
    const splitLines = this.#content.split('\n');
    const rawMap = Object.fromEntries(
      Array.from({ length: span }, (_, idx) => [
        String(startNum + idx),
        idx < splitLines.length ? splitLines[idx] : '',
      ]),
    );
    return NumberedLines.fromRaw(rawMap);
  }
  equals(other) {
    return (
      other instanceof RemovedLines &&
      this.#range.equals(other.#range) &&
      this.#content === other.#content
    );
  }
  toContract() {
    return { ...this.#range.toContract(), content: this.#content };
  }
}

export class Lines {
  #tag;
  #value;
  constructor(guard, tag, value) {
    if (guard !== linesToken) throw new Error('Use Lines.fromRaw to construct Lines');
    this.#tag = tag;
    this.#value = value;
    Object.freeze(this);
  }
  static fromRaw(raw) {
    return Result.fromZod(linesSchema, raw, (v) => v).flatMap((validated) => {
      if (typeof validated === 'string') {
        return Side.fromRaw(validated).map((s) => new Lines(linesToken, 'side', s));
      }
      if ('start' in validated && 'end' in validated && 'content' in validated) {
        return RemovedLines.fromRaw(validated).map((r) => new Lines(linesToken, 'removed', r));
      }
      return NumberedLines.fromRaw(validated).map((n) => new Lines(linesToken, 'numbered', n));
    });
  }
  match(handlers) {
    if (this.#tag === 'numbered') return handlers.numbered(this.#value);
    if (this.#tag === 'removed') return handlers.removed(this.#value);
    return handlers.side(this.#value);
  }
  toContract() {
    return this.#value.toContract();
  }
}
