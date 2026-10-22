import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { Result } from './result.mjs';

describe('Result', () => {
  test('Result.ok constructs a frozen Ok instance and dispatches ok branch in match', () => {
    const res = Result.ok(42);
    assert.equal(Object.isFrozen(res), true);
    assert.equal(res.isOk, true);
    assert.equal(res.isErr, false);
    assert.equal(res.unwrap(), 42);
    const matched = res.match({
      ok: (v) => v + 1,
      err: () => 0,
    });
    assert.equal(matched, 43);
  });

  test('Result.err constructs a frozen Err instance and dispatches err branch in match', () => {
    const res = Result.err('invalid input');
    assert.equal(Object.isFrozen(res), true);
    assert.equal(res.isOk, false);
    assert.equal(res.isErr, true);
    assert.equal(res.unwrapErr(), 'invalid input');
    const matched = res.match({
      ok: () => 'ok',
      err: (e) => `failed: ${e}`,
    });
    assert.equal(matched, 'failed: invalid input');
  });

  test('direct constructor invocation is rejected by private guard', () => {
    assert.throws(() => new Result(), /Result constructor is private/);
  });

  test('map and flatMap transform Ok values and short-circuit on Err', () => {
    const okMapped = Result.ok(10)
      .map((x) => x * 2)
      .flatMap((x) => Result.ok(x + 5));
    assert.equal(okMapped.unwrap(), 25);

    const errMapped = Result.err('boom')
      .map((x) => x * 2)
      .flatMap((x) => Result.ok(x + 5));
    assert.equal(errMapped.unwrapErr(), 'boom');
  });

  test('collect aggregates all Ok values or returns the first Err', () => {
    const allOk = Result.collect([Result.ok(1), Result.ok(2), Result.ok(3)]);
    assert.deepEqual(allOk.unwrap(), [1, 2, 3]);

    const withErr = Result.collect([Result.ok(1), Result.err('bad'), Result.ok(3)]);
    assert.equal(withErr.unwrapErr(), 'bad');
  });

  test('fromZod validates against a Zod schema and maps valid data', () => {
    const schema = z.object({ count: z.number().int().min(1) });
    const valid = Result.fromZod(schema, { count: 3 }, (data) => data.count * 10);
    assert.equal(valid.unwrap(), 30);

    const invalid = Result.fromZod(schema, { count: 0 }, (data) => data.count);
    assert.equal(invalid.isErr, true);
    assert.match(invalid.unwrapErr(), /count/);
  });
});
