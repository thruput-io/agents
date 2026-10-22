import { z } from 'zod';
import { DEFS } from '../.generated/contracts.mjs';
import { LineNumber } from './primitives.mjs';
import { Result } from './result.mjs';

const lineRangeSchema = z.fromJSONSchema(DEFS['lines.schema.json#/$defs/LineRange']);
const token = Symbol('LineRange');

export class LineRange {
  #start;
  #end;

  constructor(guard, start, end) {
    if (guard !== token) {
      throw new Error('Use LineRange.fromRaw or LineRange.fromNumbers to construct LineRange');
    }
    this.#start = start;
    this.#end = end;
    Object.freeze(this);
  }

  static fromNumbers(start, end) {
    if (!(start instanceof LineNumber) || !(end instanceof LineNumber)) {
      return Result.err('LineRange: start and end must be LineNumber instances');
    }
    if (!end.isAfterOrAt(start)) {
      return Result.err(
        `LineRange: end (${end.toContract()}) must be >= start (${start.toContract()})`,
      );
    }
    return Result.ok(new LineRange(token, start, end));
  }

  static fromRaw(raw) {
    return Result.fromZod(lineRangeSchema, raw, (v) => v).flatMap((validated) =>
      LineNumber.fromRaw(validated.start).flatMap((start) =>
        LineNumber.fromRaw(validated.end).flatMap((end) => LineRange.fromNumbers(start, end)),
      ),
    );
  }

  static union(aRanges, bRanges) {
    const sorted = [...aRanges, ...bRanges]
      .map((r) => r.toContract())
      .sort((x, y) => x.start - y.start);
    const merged = sorted.reduce((acc, range) => {
      const last = acc.at(-1);
      if (last !== undefined && range.start <= last.end + 1) {
        return [...acc.slice(0, -1), { start: last.start, end: Math.max(last.end, range.end) }];
      }
      return [...acc, { start: range.start, end: range.end }];
    }, []);
    return merged.map((r) => LineRange.fromRaw(r).unwrap());
  }

  static intersect(aRanges, bRanges) {
    const aRaw = aRanges.map((r) => r.toContract());
    const bRaw = bRanges.map((r) => r.toContract());
    const overlaps = aRaw.flatMap((a) =>
      bRaw.flatMap((b) => {
        const start = Math.max(a.start, b.start);
        const end = Math.min(a.end, b.end);
        return start <= end ? [{ start, end }] : [];
      }),
    );
    return overlaps.map((r) => LineRange.fromRaw(r).unwrap());
  }

  start() {
    return this.#start;
  }

  end() {
    return this.#end;
  }

  span() {
    return this.#end.toContract() - this.#start.toContract() + 1;
  }

  contains(lineNumber) {
    return lineNumber.isAfterOrAt(this.#start) && lineNumber.isBeforeOrAt(this.#end);
  }

  containsRange(other) {
    return this.contains(other.start()) && this.contains(other.end());
  }

  overlaps(other) {
    return this.#start.isBeforeOrAt(other.end()) && other.start().isBeforeOrAt(this.#end);
  }

  isWithinLinesOf(other, margin) {
    return (
      other.start().toContract() - this.#end.toContract() <= margin &&
      this.#start.toContract() - other.end().toContract() <= margin
    );
  }

  mergeWith(other) {
    const minStart = this.#start.isBeforeOrAt(other.start()) ? this.#start : other.start();
    const maxEnd = this.#end.isAfterOrAt(other.end()) ? this.#end : other.end();
    return LineRange.fromNumbers(minStart, maxEnd);
  }

  equals(other) {
    return (
      other instanceof LineRange &&
      this.#start.equals(other.#start) &&
      this.#end.equals(other.#end)
    );
  }

  toContract() {
    return {
      start: this.#start.toContract(),
      end: this.#end.toContract(),
    };
  }
}
