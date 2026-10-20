import test from 'node:test';
import assert from 'node:assert/strict';
import {
  complete, settled, anchorInside, checkLedger, merge, verdict, table, citation, message, alreadyOpen,
  outcome, ours, CELL, SITE,
} from './lib.mjs';

const text = (side, n) => `${side === 'head' ? 'L' : 'R'}${n}`;
const run = (side, from, to) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, text(side, from + i)]));
const files = [{ path: 'p', fragments: [
  { kind: 'surface', side: 'head', lines: run('head', 1, 5) },
  { kind: 'context', lines: run('head', 6, 8) },
  { kind: 'surface', side: 'base', lines: run('base', 9, 9) },
] }];
const probe = { kind: 'rules', review: { headCommit: 'h', files }, rulebook: { rules: [{ id: 'A', parent: 'P' }, { id: 'B', parent: 'Q' }] } };
const contextProbe = { kind: 'context', review: { headCommit: 'h', files }, rulesets: [{ url: 'https://books.example/ddd.md' }, { url: 'https://books.example/clean-code.md' }] };
const lines = (path, start, end, side) => ({ kind: 'surface', path, side, lines: run(side, start, end) });
const atPullRequest = { kind: 'pull-request' };
const violation = (anchor) => ({ observation: 'what is wrong', anchor });
const cleanRow = (rule) => ({ rule, examined: ['x'], verdict: 'clean', evidence: 'e' });
const violatedRow = (rule, violations) => ({ rule, examined: ['x'], verdict: 'violation', evidence: 'e', violations });
const bookRule = (heading) => ({ ruleset: 'https://books.example/ddd.md', heading });
const cleanBookRow = (heading) => ({ bookRule: bookRule(heading), examined: ['x'], verdict: 'clean', evidence: 'e' });
const violatedBookRow = (heading, violations) => ({ bookRule: bookRule(heading), examined: ['x'], verdict: 'violation', evidence: 'e', violations });
const citeP = `[P](${SITE}#p)`;

test('complete adds what a schema says itself, at every level: the constants of its own properties, of inherited schemas via allOf, of the one branch the document belongs to, and of what its properties and items refer to', () => {
  const schemas = {
    'review/base.schema.json': { properties: { instructions: { const: ['do instructions'] } } },
    'review/any.schema.json': { allOf: [{ $ref: 'base.schema.json' }], properties: { steps: { const: ['first', 'second'] } }, oneOf: [{ $ref: 'kinds/a.schema.json' }, { $ref: 'kinds/b.schema.json' }] },
    'review/kinds/a.schema.json': { properties: { task: { const: 'do a' }, kind: { const: 'a' }, part: { $ref: '../part.schema.json' } } },
    'review/kinds/b.schema.json': { properties: { task: { const: 'do b' }, kind: { const: 'b' }, part: { $ref: '../part.schema.json' }, items: { type: 'array', items: { $ref: '../part.schema.json#/$defs/Item' } } } },
    'review/part.schema.json': { properties: { note: { const: 'read me' }, value: { type: 'string' } }, $defs: { Item: { properties: { tag: { const: 't' }, n: { type: 'integer' } } } } },
  };
  const read = (name) => schemas[name];
  assert.deepEqual(
    complete(read, 'review/any.schema.json', { kind: 'b', part: { value: 'x' }, items: [{ n: 1 }, { n: 2 }] }),
    { instructions: ['do instructions'], steps: ['first', 'second'], task: 'do b', kind: 'b', part: { note: 'read me', value: 'x' }, items: [{ tag: 't', n: 1 }, { tag: 't', n: 2 }] },
  );
  assert.deepEqual(complete(read, 'review/any.schema.json', { kind: 'a' }), { instructions: ['do instructions'], steps: ['first', 'second'], task: 'do a', kind: 'a' });
  assert.throws(() => complete(read, 'review/any.schema.json', { kind: 'c' }), /belongs to 0 of the 2 branches/);
  assert.throws(() => complete(read, 'review/any.schema.json', {}), /belongs to 2 of the 2 branches/);
});

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
  assert.equal(checkLedger('g', probe, { headCommit: 'h', rows: [cleanRow('A'), cleanRow('B')] }), undefined);
});

test('checkLedger rejects a missing, extra, reordered, book-rule, or foreign-commit ledger', () => {
  assert.throws(() => checkLedger('g', probe, { headCommit: 'h', rows: [cleanRow('A')] }), /missing: \["B"\]/);
  assert.throws(() => checkLedger('g', probe, { headCommit: 'h', rows: [cleanRow('A'), cleanRow('B'), cleanRow('Z')] }), /extra: \["Z"\]/);
  assert.throws(() => checkLedger('g', probe, { headCommit: 'h', rows: [cleanRow('B'), cleanRow('A')] }), /in order/);
  assert.throws(() => checkLedger('g', probe, { headCommit: 'h', rows: [cleanRow('A'), cleanBookRow('x')] }), /missing: \["B"\]/);
  assert.throws(() => checkLedger('g', probe, { headCommit: 'other', rows: [cleanRow('A'), cleanRow('B')] }), /ledger is for other/);
});

test('checkLedger rejects a violation anchored outside the surface', () => {
  const rows = (anchor) => [violatedRow('A', [violation(anchor)]), cleanRow('B')];
  assert.equal(checkLedger('g', probe, { headCommit: 'h', rows: rows(lines('p', 2, 2, 'head')) }), undefined);
  assert.equal(checkLedger('g', probe, { headCommit: 'h', rows: rows(atPullRequest) }), undefined);
  assert.throws(() => checkLedger('g', probe, { headCommit: 'h', rows: rows(lines('p', 7, 7, 'head')) }), /violation of A is anchored outside the surface/);
});

test('checkLedger requires exactly three rows on rules of one ruleset the context probe was handed', () => {
  const rowOn = (ruleset) => ({ bookRule: { ruleset, heading: 'x' }, examined: ['x'], verdict: 'clean', evidence: 'e' });
  assert.equal(checkLedger('e', contextProbe, { headCommit: 'h', rows: [cleanBookRow('x'), cleanBookRow('y'), cleanBookRow('z')] }), undefined);
  assert.throws(() => checkLedger('e', contextProbe, { headCommit: 'h', rows: [cleanBookRow('x')] }), /1 rows, 3 expected/);
  assert.throws(() => checkLedger('e', contextProbe, { headCommit: 'h', rows: [cleanBookRow('x'), cleanBookRow('y'), cleanRow('A')] }), /\["A"\] is not a rule of the ruleset/);
  assert.throws(() => checkLedger('e', contextProbe, { headCommit: 'h', rows: [rowOn('https://books.example/other.md'), rowOn('https://books.example/other.md'), rowOn('https://books.example/other.md')] }), /other\.md"\] is not a ruleset the probe was handed/);
  assert.throws(() => checkLedger('e', contextProbe, { headCommit: 'h', rows: [cleanBookRow('x'), cleanBookRow('y'), rowOn('https://books.example/clean-code.md')] }), /selects one ruleset/);
});

const ledger = {
  headCommit: 'h',
  rows: [
    violatedRow('A', [violation(lines('p', 3, 3, 'head')), violation(atPullRequest)]),
    { rule: 'B', examined: ['x'], verdict: 'clean', evidence: `has | pipe\nand newline ${'x'.repeat(CELL)}` },
  ],
};
const contextLedger = { headCommit: 'h', rows: [violatedBookRow('Book rule', [violation(lines('p', 9, 9, 'base'))])] };
const entries = [{ document: probe, ledger }, { document: contextProbe, ledger: contextLedger }];

test('merge concatenates rows into the one ledger and verdict follows any violation', () => {
  assert.deepEqual(merge([{ headCommit: 'h', rows: [cleanRow('A')] }, { headCommit: 'h', rows: [cleanBookRow('x')] }]), { headCommit: 'h', rows: [cleanRow('A'), cleanBookRow('x')] });
  assert.equal(verdict(ledger), 'request-changes');
  assert.equal(verdict({ headCommit: 'h', rows: [cleanRow('A')] }), 'approve');
});

test('table escapes pipes and newlines, caps a cell, and names a book rule by its heading', () => {
  const rendered = table(ledger);
  assert.match(rendered, /has \\\| pipe and newline/);
  assert.ok(rendered.split('\n')[3].length < CELL + 100);
  assert.match(rendered, /…/);
  assert.match(table(contextLedger), /\n\| Book rule \| x \| violation \| e \|$/);
});

test('citation, message, alreadyOpen, settled, outcome, and ours', () => {
  const document = { kind: 'rules', rulebook: { rules: [{ id: 'R', parent: "You aren't gonna need it" }] } };
  assert.equal(citation(document, cleanRow('R')), `[You aren't gonna need it](${SITE}#you-arent-gonna-need-it)`);
  assert.equal(citation(contextProbe, cleanBookRow('Book rule')), '[Book rule](https://books.example/ddd.md)');
  assert.equal(message(violation(atPullRequest), citeP), `what is wrong breaks ${citeP}`);
  const open = [{ path: 'p', lines: { start: 3, end: 3 }, body: `earlier breaks ${citeP}` }];
  assert.equal(alreadyOpen(violation(lines('p', 3, 3, 'head')), citeP, open), true);
  assert.equal(alreadyOpen(violation(lines('p', 4, 4, 'head')), citeP, open), false);
  assert.equal(alreadyOpen(violation(atPullRequest), citeP, open), false);
  const openThread = { id: 'o', path: 'p', side: 'head', lines: { start: 3, end: 3 }, state: 'open', body: `earlier breaks ${citeP}` };
  const gone = { id: 'g', path: 'p', side: 'head', lines: { start: 7, end: 7 }, state: 'open', body: `earlier breaks ${citeP}` };
  const resolved = { id: 'r', path: 'p', side: 'base', lines: { start: 9, end: 9 }, state: 'resolved-by-author', body: 'earlier breaks [Book rule](https://books.example/ddd.md)' };
  const result = outcome(entries, [openThread, gone, resolved]);
  assert.equal(result.verdict, 'request-changes');
  assert.deepEqual(result.settle, ['g']);
  assert.deepEqual(result.reopen, ['r']);
  assert.equal(ours(`what is wrong breaks ${citeP}`), true);
  assert.equal(ours('Policy status has been updated'), false);
});
