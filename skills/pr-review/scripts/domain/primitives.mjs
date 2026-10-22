import { z } from 'zod';
import { DEFS } from './contracts.mjs';
import { Result } from './result.mjs';

function definePrimitive(typeName, zodSchema) {
  const token = Symbol(typeName);
  return class PrimitiveValue {
    #value;

    constructor(guard, value) {
      if (guard !== token) {
        throw new Error(`Use ${typeName}.fromRaw to construct ${typeName}`);
      }
      this.#value = value;
      Object.freeze(this);
    }

    static fromRaw(raw) {
      return Result.fromZod(
        zodSchema,
        raw,
        (validated) => new PrimitiveValue(token, validated),
      ).match({
        ok: (instance) => Result.ok(instance),
        err: (msg) => Result.err(`${typeName}: ${msg}`),
      });
    }

    equals(other) {
      return other instanceof PrimitiveValue && this.#value === other.#value;
    }

    toContract() {
      return this.#value;
    }

    toString() {
      return String(this.#value);
    }
  };
}

const lineNumberSchema = z.fromJSONSchema(DEFS['lines.schema.json#/$defs/LineNumber']);
const lineNumberToken = Symbol('LineNumber');

export class LineNumber {
  #value;

  constructor(guard, value) {
    if (guard !== lineNumberToken) {
      throw new Error('Use LineNumber.fromRaw to construct LineNumber');
    }
    this.#value = value;
    Object.freeze(this);
  }

  static fromRaw(raw) {
    return Result.fromZod(
      lineNumberSchema,
      raw,
      (validated) => new LineNumber(lineNumberToken, validated),
    ).match({
      ok: (instance) => Result.ok(instance),
      err: (msg) => Result.err(`LineNumber: ${msg}`),
    });
  }

  distanceTo(other) {
    return Math.abs(this.#value - other.toContract());
  }

  isBeforeOrAt(other) {
    return this.#value <= other.toContract();
  }

  isAfterOrAt(other) {
    return this.#value >= other.toContract();
  }

  compareTo(other) {
    return this.#value - other.toContract();
  }

  offsetBy(delta) {
    return LineNumber.fromRaw(this.#value + delta);
  }

  next() {
    return LineNumber.fromRaw(this.#value + 1);
  }

  equals(other) {
    return other instanceof LineNumber && this.#value === other.#value;
  }

  toContract() {
    return this.#value;
  }

  toString() {
    return String(this.#value);
  }
}

export const RepositoryPath = definePrimitive(
  'RepositoryPath',
  z.fromJSONSchema(DEFS['pull-request.schema.json#/$defs/RepositoryPath']),
);

export const Ref = definePrimitive(
  'Ref',
  z.fromJSONSchema(DEFS['pull-request.schema.json#/$defs/Ref']),
);

export const CommitSha = definePrimitive(
  'CommitSha',
  z.fromJSONSchema(DEFS['change-set.schema.json#/$defs/Commit']),
);

export const ChangedPath = definePrimitive(
  'ChangedPath',
  z.fromJSONSchema(DEFS['change-set.schema.json#/$defs/Path']),
);

export const LineText = definePrimitive(
  'LineText',
  z
    .fromJSONSchema(DEFS['lines.schema.json#/$defs/LineText'])
    .refine((v) => !v.includes('\n') && !v.includes('\r'), 'LineText cannot contain line breaks'),
);

export const RulesetUrl = definePrimitive(
  'RulesetUrl',
  z
    .fromJSONSchema(DEFS['ledger.schema.json#/$defs/RulesetUrl'])
    .refine(
      (v) => URL.canParse(v) && (v.startsWith('https://') || v.startsWith('http://')),
      'RulesetUrl must be an HTTP(S) URL',
    ),
);

export const ThreadId = definePrimitive(
  'ThreadId',
  z.fromJSONSchema(DEFS['threads.schema.json#/$defs/ThreadId']),
);

export const Identifier = definePrimitive(
  'Identifier',
  z.fromJSONSchema(DEFS['pull-request.schema.json#/$defs/Login']),
);

export const PositiveInteger = definePrimitive(
  'PositiveInteger',
  z.fromJSONSchema(DEFS['pull-request.schema.json#/$defs/PullRequestNumber']),
);

export const NonEmptyText = definePrimitive(
  'NonEmptyText',
  z.fromJSONSchema(DEFS['threads.schema.json#/$defs/ThreadBody']),
);
