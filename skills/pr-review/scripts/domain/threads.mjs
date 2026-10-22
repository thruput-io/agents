import { z } from 'zod';
import { DEFS, SCHEMAS } from '../.generated/contracts.mjs';
import { LineRange } from './line-range.mjs';
import { Side } from './lines.mjs';
import { ChangedPath, NonEmptyText, ThreadId } from './primitives.mjs';
import { Result } from './result.mjs';
import { RULES_SITE_URL } from './rulebook.mjs';

const threadSchema = z.fromJSONSchema(DEFS['threads.schema.json#/$defs/Thread']);
const threadsSchema = z.fromJSONSchema(SCHEMAS['threads.schema.json']);
const threadToken = Symbol('Thread');
const threadsToken = Symbol('Threads');
const RENDERED_BREAKS = / breaks \[[^\]]+\]\([^)]+\)/;

function groupRangesByPath(threadsForSide) {
  const paths = [...new Set(threadsForSide.map((t) => t.path().toContract()))];
  return new Map(
    paths.map((pathKey) => {
      const ranges = threadsForSide
        .filter((t) => t.path().toContract() === pathKey)
        .map((t) => t.lines());
      return [pathKey, LineRange.union(ranges, [])];
    }),
  );
}

export class Thread {
  #id;
  #path;
  #side;
  #lines;
  #state;
  #body;
  constructor(guard, id, path, side, lines, state, body) {
    if (guard !== threadToken) throw new Error('Use Thread.fromRaw to construct Thread');
    this.#id = id;
    this.#path = path;
    this.#side = side;
    this.#lines = lines;
    this.#state = state;
    this.#body = body;
    Object.freeze(this);
  }
  static fromRaw(raw) {
    return Result.fromZod(threadSchema, raw, (v) => v).flatMap((v) =>
      ThreadId.fromRaw(v.id).flatMap((id) =>
        ChangedPath.fromRaw(v.path).flatMap((path) =>
          Side.fromRaw(v.side).flatMap((side) =>
            LineRange.fromRaw(v.lines).flatMap((lines) =>
              NonEmptyText.fromRaw(v.body).map(
                (body) => new Thread(threadToken, id, path, side, lines, v.state, body),
              ),
            ),
          ),
        ),
      ),
    );
  }
  static isOurs(text) {
    return typeof text === 'string' && (RENDERED_BREAKS.test(text) || text.includes(RULES_SITE_URL));
  }
  id() {
    return this.#id;
  }
  path() {
    return this.#path;
  }
  side() {
    return this.#side;
  }
  lines() {
    return this.#lines;
  }
  state() {
    return this.#state;
  }
  body() {
    return this.#body;
  }
  isActive() {
    return this.#state !== 'resolved';
  }
  isOpen() {
    return this.#state === 'open';
  }
  isResolvedByAuthor() {
    return this.#state === 'resolved-by-author';
  }
  carriesFinding(path, endLineNumber, citation) {
    return (
      this.#path.equals(path) &&
      this.#lines.end().equals(endLineNumber) &&
      this.#body.toContract().includes(citation)
    );
  }
  toContract() {
    return {
      id: this.#id.toContract(),
      path: this.#path.toContract(),
      side: this.#side.toContract(),
      lines: this.#lines.toContract(),
      state: this.#state,
      body: this.#body.toContract(),
    };
  }
}

export class Threads {
  #threads;
  constructor(guard, threads) {
    if (guard !== threadsToken) throw new Error('Use Threads.fromRaw to construct Threads');
    this.#threads = Object.freeze([...threads]);
    Object.freeze(this);
  }
  static fromRaw(raw) {
    return Result.fromZod(threadsSchema, raw, (v) => v).flatMap((v) =>
      Result.collect(v.threads.map((t) => Thread.fromRaw(t))).map(
        (threads) => new Threads(threadsToken, threads),
      ),
    );
  }
  threads() {
    return this.#threads;
  }
  openThreads() {
    return this.#threads.filter((t) => t.isOpen());
  }
  resolvedByAuthorThreads() {
    return this.#threads.filter((t) => t.isResolvedByAuthor());
  }
  activeRangesBySide() {
    const active = this.#threads.filter((t) => t.isActive());
    return {
      head: groupRangesByPath(active.filter((t) => t.side().equals(Side.HEAD))),
      base: groupRangesByPath(active.filter((t) => t.side().equals(Side.BASE))),
    };
  }
  anyCarriesFinding(path, endLineNumber, citation) {
    return this.#threads.some((t) => t.carriesFinding(path, endLineNumber, citation));
  }
  toContract() {
    return { threads: this.#threads.map((t) => t.toContract()) };
  }
}
