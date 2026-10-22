import { join } from 'node:path';
import { z } from 'zod';
import { SCHEMAS } from './contracts.mjs';
import { Result } from './result.mjs';

const checkoutSchema = z.fromJSONSchema(SCHEMAS['checkout.schema.json']);
const token = Symbol('Checkout');

export class Checkout {
  #value;
  constructor(guard, value) {
    if (guard !== token) throw new Error('Use Checkout.fromRaw to construct Checkout');
    this.#value = value;
    Object.freeze(this);
  }
  static fromRaw(raw) {
    return Result.fromZod(checkoutSchema, raw, (v) => new Checkout(token, v)).match({
      ok: (instance) => Result.ok(instance),
      err: (msg) => Result.err(`Checkout: ${msg}`),
    });
  }
  resolvePath(changedPath) {
    return join(this.#value, changedPath.toContract());
  }
  equals(other) {
    return other instanceof Checkout && this.#value === other.#value;
  }
  toContract() {
    return this.#value;
  }
  toString() {
    return this.#value;
  }
}
