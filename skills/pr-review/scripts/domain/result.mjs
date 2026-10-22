const GUARD = Symbol('Result');

function formatIssues(issues) {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
      return `${path}${issue.message}`;
    })
    .join('; ');
}

export class Result {
  #ok;
  #value;
  #error;

  constructor(guard, ok, value, error) {
    if (guard !== GUARD) {
      throw new Error('Result constructor is private; use Result.ok or Result.err');
    }
    this.#ok = ok;
    this.#value = value;
    this.#error = error;
    Object.freeze(this);
  }

  static ok(value) {
    return new Result(GUARD, true, value, null);
  }

  static err(error) {
    return new Result(GUARD, false, null, error);
  }

  get isOk() {
    return this.#ok;
  }

  get isErr() {
    return !this.#ok;
  }

  match(handlers) {
    return this.#ok ? handlers.ok(this.#value) : handlers.err(this.#error);
  }

  map(fn) {
    return this.#ok ? Result.ok(fn(this.#value)) : this;
  }

  flatMap(fn) {
    return this.#ok ? fn(this.#value) : this;
  }

  unwrap() {
    if (!this.#ok) {
      throw new Error(String(this.#error));
    }
    return this.#value;
  }

  unwrapErr() {
    if (this.#ok) {
      throw new Error('Expected Err result');
    }
    return this.#error;
  }

  static collect(results) {
    return results.reduce(
      (acc, item) => acc.flatMap((values) => item.map((val) => [...values, val])),
      Result.ok([]),
    );
  }

  static fromZod(zodSchema, raw, mapFn) {
    const parsed = zodSchema.safeParse(raw);
    if (!parsed.success) {
      return Result.err(formatIssues(parsed.error.issues));
    }
    return Result.ok(mapFn(parsed.data));
  }

  static flatFromZod(zodSchema, raw, mapResultFn) {
    const parsed = zodSchema.safeParse(raw);
    if (!parsed.success) {
      return Result.err(formatIssues(parsed.error.issues));
    }
    return mapResultFn(parsed.data);
  }
}
