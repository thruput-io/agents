import { z } from 'zod';
import { DEFS, SCHEMAS } from './contracts.mjs';
import { NumberedLines, Side } from './lines.mjs';
import { Result } from './result.mjs';

const surfaceFragmentSchema = z.fromJSONSchema(DEFS['fragment.schema.json#/$defs/SurfaceFragment']);
const contextFragmentSchema = z.fromJSONSchema(DEFS['fragment.schema.json#/$defs/ContextFragment']);
const fragmentSchema = z.fromJSONSchema(SCHEMAS['fragment.schema.json']);

const surfaceFragToken = Symbol('SurfaceFragment');
const contextFragToken = Symbol('ContextFragment');
const fragmentToken = Symbol('Fragment');

export class SurfaceFragment {
  #side;
  #lines;

  constructor(guard, side, lines) {
    if (guard !== surfaceFragToken) {
      throw new Error('Use SurfaceFragment.fromRaw or SurfaceFragment.create to construct SurfaceFragment');
    }
    this.#side = side;
    this.#lines = lines;
    Object.freeze(this);
  }

  static create(side, lines) {
    if (!(side instanceof Side) || !(lines instanceof NumberedLines)) {
      return Result.err('SurfaceFragment: requires Side and NumberedLines');
    }
    return Result.ok(new SurfaceFragment(surfaceFragToken, side, lines));
  }

  static fromRaw(raw) {
    return Result.fromZod(surfaceFragmentSchema, raw, (v) => v).flatMap((validated) =>
      Side.fromRaw(validated.side).flatMap((side) =>
        NumberedLines.fromRaw(validated.lines).flatMap((lines) =>
          SurfaceFragment.create(side, lines),
        ),
      ),
    );
  }

  side() {
    return this.#side;
  }

  lines() {
    return this.#lines;
  }

  containsAnchorSlice(side, numberedLines) {
    return this.#side.equals(side) && this.#lines.containsSlice(numberedLines);
  }

  toContract() {
    return {
      kind: 'surface',
      side: this.#side.toContract(),
      lines: this.#lines.toContract(),
    };
  }
}

export class ContextFragment {
  #lines;

  constructor(guard, lines) {
    if (guard !== contextFragToken) {
      throw new Error('Use ContextFragment.fromRaw or ContextFragment.create to construct ContextFragment');
    }
    this.#lines = lines;
    Object.freeze(this);
  }

  static create(lines) {
    if (!(lines instanceof NumberedLines)) {
      return Result.err('ContextFragment: requires NumberedLines');
    }
    return Result.ok(new ContextFragment(contextFragToken, lines));
  }

  static fromRaw(raw) {
    return Result.fromZod(contextFragmentSchema, raw, (v) => v)
      .flatMap((validated) =>
        NumberedLines.fromRaw(validated.lines).flatMap((lines) => ContextFragment.create(lines)),
      )
      .match({
        ok: (frag) => Result.ok(frag),
        err: (msg) => Result.err(`ContextFragment: ${msg}`),
      });
  }

  lines() {
    return this.#lines;
  }

  toContract() {
    return {
      kind: 'context',
      lines: this.#lines.toContract(),
    };
  }
}

export class Fragment {
  #tag;
  #value;

  constructor(guard, tag, value) {
    if (guard !== fragmentToken) {
      throw new Error('Use Fragment.fromRaw to construct Fragment');
    }
    this.#tag = tag;
    this.#value = value;
    Object.freeze(this);
  }

  static fromSurface(surfaceFragment) {
    return new Fragment(fragmentToken, 'surface', surfaceFragment);
  }

  static fromContext(contextFragment) {
    return new Fragment(fragmentToken, 'context', contextFragment);
  }

  static fromRaw(raw) {
    return Result.fromZod(fragmentSchema, raw, (v) => v).flatMap((validated) =>
      validated.kind === 'surface'
        ? SurfaceFragment.fromRaw(validated).map((sf) => Fragment.fromSurface(sf))
        : ContextFragment.fromRaw(validated).map((cf) => Fragment.fromContext(cf)),
    );
  }

  match(handlers) {
    return this.#tag === 'surface'
      ? handlers.surface(this.#value)
      : handlers.context(this.#value);
  }

  toContract() {
    return this.#value.toContract();
  }
}
