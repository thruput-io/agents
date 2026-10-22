import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Checkout } from './checkout.mjs';
import { ChangedPath } from './primitives.mjs';

describe('Checkout', () => {
  it('validates non-empty checkout path and resolves ChangedPath inside snapshot', () => {
    const checkout = Checkout.fromRaw('/tmp/review/snapshot').unwrap();
    assert.equal(checkout.toContract(), '/tmp/review/snapshot');
    assert.equal(Object.isFrozen(checkout), true);
    const rel = ChangedPath.fromRaw('skills/pr-review/SKILL.md').unwrap();
    assert.equal(checkout.resolvePath(rel), '/tmp/review/snapshot/skills/pr-review/SKILL.md');
  });

  it('rejects empty or non-string checkout values', () => {
    assert.equal(Checkout.fromRaw('').isErr, true);
    assert.equal(Checkout.fromRaw(null).isErr, true);
  });
});
