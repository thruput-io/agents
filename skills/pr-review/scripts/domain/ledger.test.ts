import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Anchor, Row, Violation } from './contracts.g.ts';
import { anchorInside, checkLedger, type LedgerProbe } from './ledger.ts';

const H = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);

const text = (side: 'head' | 'base', n: number) => `${side === 'head' ? 'L' : 'R'}${n}`;
const run = (side: 'head' | 'base', from: number, to: number) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, text(side, from + i)]));
const files = [{ path: 'p', fragments: [
  { kind: 'surface' as const, side: 'head' as const, lines: run('head', 1, 5) },
  { kind: 'context' as const, lines: run('head', 6, 8) },
  { kind: 'surface' as const, side: 'base' as const, lines: run('base', 9, 9) },
] }];
const probe: LedgerProbe = { review: { headCommit: H, files }, rulebook: { rules: [{ id: 'A' }, { id: 'B' }] } };
const contextProbe: LedgerProbe = { review: { headCommit: H, files }, rulesets: [{ url: 'https://books.example/ddd.md' }, { url: 'https://books.example/clean-code.md' }] };

const lines = (path: string, start: number, end: number, side: 'head' | 'base'): Anchor => ({ kind: 'surface', path, side, lines: run(side, start, end) });
const atPullRequest: Anchor = { kind: 'pull-request' };
const violation = (anchor: Anchor): Violation => ({ observation: 'what is wrong', anchor });
const cleanRow = (rule: string): Row => ({ rule, examined: ['x'], verdict: 'clean', evidence: 'e' });
const violatedRow = (rule: string, violations: Violation[]): Row => ({ rule, examined: ['x'], verdict: 'violation', evidence: 'e', violations });
const bookRule = (heading: string) => ({ ruleset: 'https://books.example/ddd.md', heading });
const cleanBookRow = (heading: string): Row => ({ bookRule: bookRule(heading), examined: ['x'], verdict: 'clean', evidence: 'e' });
const rowOn = (ruleset: string): Row => ({ bookRule: { ruleset, heading: 'x' }, examined: ['x'], verdict: 'clean', evidence: 'e' });

test('anchorInside accepts lines copied from one surface fragment on their side, and the pull request', () => {
  assert.equal(anchorInside(lines('p', 3, 3, 'head'), files), true);
  assert.equal(anchorInside(lines('p', 1, 5, 'head'), files), true);
  assert.equal(anchorInside(lines('p', 9, 9, 'base'), files), true);
  assert.equal(anchorInside(atPullRequest, files), true);
  assert.equal(anchorInside(lines('p', 6, 6, 'head'), files), false);
  assert.equal(anchorInside(lines('p', 3, 3, 'base'), files), false);
  assert.equal(anchorInside(lines('q', 1, 1, 'head'), files), false);
  assert.equal(anchorInside({ kind: 'surface', path: 'p', side: 'head', lines: { 3: 'edited' } }, files), false);
  assert.equal(anchorInside({ kind: 'surface', path: 'p', side: 'head', lines: {} }, files), false);
});

test('checkLedger accepts rows matching the rules in order', () => {
  checkLedger('g', probe, { headCommit: H, rows: [cleanRow('A'), cleanRow('B')] });
});

test('checkLedger rejects a missing, extra, reordered, book-rule, or foreign-commit ledger', () => {
  assert.throws(() => checkLedger('g', probe, { headCommit: H, rows: [cleanRow('A')] }), /missing: \["B"\]/);
  assert.throws(() => checkLedger('g', probe, { headCommit: H, rows: [cleanRow('A'), cleanRow('B'), cleanRow('Z')] }), /extra: \["Z"\]/);
  assert.throws(() => checkLedger('g', probe, { headCommit: H, rows: [cleanRow('B'), cleanRow('A')] }), /in order/);
  assert.throws(() => checkLedger('g', probe, { headCommit: H, rows: [cleanRow('A'), cleanBookRow('x')] }), /missing: \["B"\]/);
  assert.throws(() => checkLedger('g', probe, { headCommit: OTHER, rows: [cleanRow('A'), cleanRow('B')] }), /ledger is for b{40}/);
});

test('checkLedger rejects a violation anchored outside the surface', () => {
  const rows = (anchor: Anchor) => [violatedRow('A', [violation(anchor)]), cleanRow('B')];
  checkLedger('g', probe, { headCommit: H, rows: rows(lines('p', 2, 2, 'head')) });
  checkLedger('g', probe, { headCommit: H, rows: rows(atPullRequest) });
  assert.throws(() => checkLedger('g', probe, { headCommit: H, rows: rows(lines('p', 7, 7, 'head')) }), /violation of A is anchored outside the surface/);
});

test('checkLedger requires exactly three rows on rules of one ruleset the context probe was handed', () => {
  checkLedger('e', contextProbe, { headCommit: H, rows: [cleanBookRow('x'), cleanBookRow('y'), cleanBookRow('z')] });
  assert.throws(() => checkLedger('e', contextProbe, { headCommit: H, rows: [cleanBookRow('x')] }), /1 rows, 3 expected/);
  assert.throws(() => checkLedger('e', contextProbe, { headCommit: H, rows: [cleanBookRow('x'), cleanBookRow('y'), cleanRow('A')] }), /\["A"\] is not a rule of the ruleset/);
  assert.throws(() => checkLedger('e', contextProbe, { headCommit: H, rows: [rowOn('https://books.example/other.md'), rowOn('https://books.example/other.md'), rowOn('https://books.example/other.md')] }), /other\.md"\] is not a ruleset the probe was handed/);
  assert.throws(() => checkLedger('e', contextProbe, { headCommit: H, rows: [cleanBookRow('x'), cleanBookRow('y'), rowOn('https://books.example/clean-code.md')] }), /selects one ruleset/);
});
