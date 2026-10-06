import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDiff, parseHunks, intersect, union, threadRanges, wholeSurface, narrowSurface, slug, partition, kindOf, checkKinds, rulebook, rawUrl, rulesets,
  instructions, complete, numbered, anchorInside, checkLedger, merge, verdict, table, comment, citation, message, alreadyOpen,
  review, azureDevOpsReview, CELL, SITE,
} from './lib.mjs';

const diff = [
  'diff --git a/scripts/verify.sh b/scripts/verify.sh',
  'index 1111111..2222222 100644',
  '--- a/scripts/verify.sh',
  '+++ b/scripts/verify.sh',
  '@@ -18,3 +18,4 @@ jsonschema=(npx)',
  ' lint',
  '-old',
  '+new',
  '+added',
  ' tail',
  'diff --git a/web/_includes/chain.html b/web/_includes/chain.html',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/web/_includes/chain.html',
  '@@ -0,0 +1,2 @@',
  '+<ul>',
  '+</ul>',
  'diff --git a/gone.txt b/gone.txt',
  'deleted file mode 100644',
  '--- a/gone.txt',
  '+++ /dev/null',
  '@@ -1,2 +0,0 @@',
  '-a',
  '-b',
  '--- not a header',
  '',
].join('\n');

test('parseDiff numbers added lines at head and removed lines at base with their text, per file', () => {
  assert.deepEqual(parseDiff(diff), [
    { path: 'scripts/verify.sh', added: [{ start: 19, end: 20 }], removed: [{ start: 19, end: 19, content: 'old' }] },
    { path: 'web/_includes/chain.html', added: [{ start: 1, end: 2 }], removed: [] },
    { path: 'gone.txt', added: [], removed: [{ start: 1, end: 3, content: 'a\nb\n-- not a header' }] },
  ]);
});

test('parseHunks reads a compare-API patch without file headers', () => {
  assert.deepEqual(parseHunks(['@@ -5,2 +5,3 @@', ' keep', '+one', '+two', ' keep']), { added: [{ start: 6, end: 7 }], removed: [] });
});

test('intersect and union of ranges', () => {
  assert.deepEqual(intersect([{ start: 1, end: 10 }, { start: 20, end: 30 }], [{ start: 5, end: 25 }]), [{ start: 5, end: 10 }, { start: 20, end: 25 }]);
  assert.deepEqual(union([{ start: 1, end: 3 }], [{ start: 4, end: 6 }, { start: 10, end: 12 }]), [{ start: 1, end: 6 }, { start: 10, end: 12 }]);
});

const threads = [
  { path: 'a.sh', diffSide: 'RIGHT', startLine: null, line: 5, isResolved: false, resolvedBy: null },
  { path: 'a.sh', diffSide: 'RIGHT', startLine: 8, line: 9, isResolved: true, resolvedBy: { login: 'author' } },
  { path: 'a.sh', diffSide: 'RIGHT', startLine: null, line: 12, isResolved: true, resolvedBy: { login: 'reviewer' } },
  { path: 'b.sh', diffSide: 'LEFT', startLine: null, line: 2, isResolved: false, resolvedBy: null },
  { path: 'c.sh', diffSide: 'RIGHT', startLine: null, line: null, isResolved: false, resolvedBy: null },
];

test('threadRanges keeps unresolved threads and threads the author resolved, folding the host side into head and base', () => {
  const sides = threadRanges(threads, 'author');
  assert.deepEqual([...sides.head], [['a.sh', [{ start: 5, end: 5 }, { start: 8, end: 9 }]]]);
  assert.deepEqual([...sides.base], [['b.sh', [{ start: 2, end: 2 }]]]);
});

const changeSet = {
  headCommit: 'h',
  files: [
    { path: 'a.sh', added: [{ start: 1, end: 20 }], removed: [] },
    { path: 'b.sh', added: [{ start: 1, end: 1 }], removed: [{ start: 1, end: 4, content: 'one\ntwo\nthree\nfour' }] },
    { path: 'd.sh', added: [{ start: 1, end: 9 }], removed: [] },
  ],
};

test('wholeSurface is every line of the change set, by number only', () => {
  assert.deepEqual(wholeSurface(changeSet), {
    files: [
      { path: 'a.sh', added: [{ start: 1, end: 20 }], removed: [] },
      { path: 'b.sh', added: [{ start: 1, end: 1 }], removed: [{ start: 1, end: 4 }] },
      { path: 'd.sh', added: [{ start: 1, end: 9 }], removed: [] },
    ],
  });
});

test('narrowSurface keeps change-set lines that changed since the prior review or carry a thread', () => {
  const changedSince = new Map([['a.sh', [{ start: 15, end: 30 }]]]);
  assert.deepEqual(narrowSurface(changeSet, changedSince, threadRanges(threads, 'author')), {
    files: [
      { path: 'a.sh', added: [{ start: 5, end: 5 }, { start: 8, end: 9 }, { start: 15, end: 20 }], removed: [] },
      { path: 'b.sh', added: [], removed: [{ start: 2, end: 2 }] },
    ],
  });
});

test('slug derives the anchor the site uses', () => {
  assert.equal(slug("Demonstrable, not recalled"), 'demonstrable-not-recalled');
  assert.equal(slug("You aren't gonna need it"), 'you-arent-gonna-need-it');
  assert.equal(slug('Behavior & Failure Handling'), 'behavior-failure-handling');
});

const rules = [
  { id: 'A', group: 'G1' }, { id: 'B', group: 'G2' }, { id: 'C', group: 'G1' },
];

test('partition groups rules in first-seen order and keeps rule order inside a group', () => {
  assert.deepEqual(partition(rules), [
    { name: 'g1', group: 'G1', rules: [rules[0], rules[2]] },
    { name: 'g2', group: 'G2', rules: [rules[1]] },
  ]);
});

test('kindOf names the probe a group gets: the reuse ladder, dead code, or a probe of rules', () => {
  assert.equal(kindOf('Reuse'), 'reuse-ladder');
  assert.equal(kindOf('Dead Code'), 'dead-code');
  assert.equal(kindOf('Failure Handling'), 'rules');
});

test('checkKinds refuses rules that lack a group a kind of probe is tied to', () => {
  checkKinds(['Reuse', 'Dead Code', 'Failure Handling']);
  assert.throws(() => checkKinds(['Reuse', 'Failure Handling']), /Dead Code/);
});

const governance = {
  principles: [{ id: 'P', parent: 'R', body: 'Uses [[Term]].' }, { id: 'Unused principle', parent: 'R', body: 'Unused.' }],
  definitions: [
    { id: 'Term', specification: 'Means [[Nested]], and cites [[P]], which is a principle and no glossary term.' },
    { id: 'Nested', specification: 'A kind.', closedEnumerationOf: ['Listed'] },
    { id: 'Listed', specification: 'Listed by an enumeration.' },
    { id: 'Rule term', specification: 'Cited by a rule.' },
    { id: 'Unused term', specification: 'Nothing cites it.' },
  ],
};

test('rulebook hands a probe its rules with their principles and every glossary term those cite', () => {
  const own = [{ id: 'A', parent: 'P', body: 'Do [[Rule term]].' }, { id: 'B', parent: 'P', body: 'Do.' }];
  assert.deepEqual(rulebook(own, governance), {
    rules: own,
    principles: [governance.principles[0]],
    definitions: governance.definitions.slice(0, 4),
  });
});

test('rulebook refuses a parent that is not declared', () => {
  assert.throws(() => rulebook([{ id: 'A', parent: 'Missing', body: 'Do.' }], governance), /principle Missing/);
});

test('rawUrl is where the text of a file is read, from its canonical URL on the host', () => {
  assert.equal(rawUrl('https://github.com/ciembor/agent-rules-books/blob/main/ddd/ddd.md'), 'https://raw.githubusercontent.com/ciembor/agent-rules-books/main/ddd/ddd.md');
  assert.throws(() => rawUrl('https://books.example/ddd.md'), /is not a file on github.com/);
});

test('rulesets folds the index and the text read for each entry into what the escalation probe is handed', () => {
  const index = [{ id: 'ddd', title: 'Domain-Driven Design', author: 'Eric Evans', focus: 'Domain Modeling', when_to_use: 'Strategic modeling.', review_checklist: 'Guard aggregates.', tree_url: 'https://books.example/ddd', canonical_url: 'https://books.example/ddd.md' }];
  assert.deepEqual(rulesets(index, new Map([['https://books.example/ddd.md', '# Rules']])), [
    { url: 'https://books.example/ddd.md', title: 'Domain-Driven Design', focus: 'Domain Modeling', whenToUse: 'Strategic modeling.', text: '# Rules' },
  ]);
  assert.throws(() => rulesets(index, new Map()), /ddd\.md was not read/);
});

test('instructions hands every probe the review with its ledger file and its report command, a rule probe its rulebook, the probes that look beyond the change the checkout, and the escalation probe the rulesets', () => {
  const context = {
    review: { changeSet: { headCommit: 'h', files: [] } },
    ledger: (name) => `/w/ledger/${name}.json`,
    report: (name) => `validate /w/ledger/${name}.json`,
    checkout: '/w/snapshot',
  };
  const probes = [{ name: 'g1', kind: 'rules', rulebook: 'r1' }, { name: 'g2', kind: 'reuse-ladder', rulebook: 'r2' }, { name: 'g3', kind: 'dead-code', rulebook: 'r3' }];
  const files = instructions(context, probes, ['a ruleset']);
  const handed = (name) => ({ changeSet: { headCommit: 'h', files: [] }, ledger: `/w/ledger/${name}.json`, report: `validate /w/ledger/${name}.json` });
  assert.deepEqual(files.map((file) => file.name), ['01-g1', '02-g2', '03-g3', '04-escalation']);
  assert.deepEqual(files[0].document, { kind: 'rules', review: handed('01-g1'), rulebook: 'r1' });
  assert.deepEqual(files[1].document, { kind: 'reuse-ladder', review: handed('02-g2'), rulebook: 'r2', checkout: '/w/snapshot' });
  assert.deepEqual(files[2].document, { kind: 'dead-code', review: handed('03-g3'), rulebook: 'r3', checkout: '/w/snapshot' });
  assert.deepEqual(files[3].document, { kind: 'escalation', review: handed('04-escalation'), rulesets: ['a ruleset'] });
});

const surface = { files: [{ path: 'p', added: [{ start: 1, end: 5 }], removed: [{ start: 9, end: 9 }] }] };
const probe = { kind: 'rules', review: { changeSet: { headCommit: 'h' }, surface }, rulebook: { rules: [{ id: 'A', parent: 'P' }, { id: 'B', parent: 'Q' }] } };
const escalation = { kind: 'escalation', review: { changeSet: { headCommit: 'h' }, surface }, rulesets: [{ url: 'https://books.example/ddd.md' }, { url: 'https://books.example/clean-code.md' }] };
const lines = (path, start, end, side) => ({ kind: 'lines', path, side, lines: { start, end } });
const atPullRequest = { kind: 'pull-request' };
const violation = (anchor) => ({ observation: 'what is wrong', anchor });
const finding = (anchor) => ({ ...violation(anchor), body: 'rendered' });
const cleanRow = (rule) => ({ rule, examined: ['x'], verdict: 'clean', evidence: 'e' });
const violatedRow = (rule, violations) => ({ rule, examined: ['x'], verdict: 'violation', evidence: 'e', violations });
const bookRule = (heading) => ({ ruleset: 'https://books.example/ddd.md', heading });
const cleanBookRow = (heading) => ({ bookRule: bookRule(heading), examined: ['x'], verdict: 'clean', evidence: 'e' });
const violatedBookRow = (heading, violations) => ({ bookRule: bookRule(heading), examined: ['x'], verdict: 'violation', evidence: 'e', violations });
const citeP = `[P](${SITE}#p)`;

test('numbered lists the lines of a file by their number from 1, a final newline ending the last line rather than starting another, and an empty file having none', () => {
  assert.deepEqual(numbered('#!/usr/bin/env bash\nset -euo pipefail\n'), { 1: '#!/usr/bin/env bash', 2: 'set -euo pipefail' });
  assert.deepEqual(numbered('a\n\nb'), { 1: 'a', 2: '', 3: 'b' });
  assert.deepEqual(numbered(''), {});
  assert.deepEqual(Object.keys(numbered('x\n'.repeat(12))).at(-1), '12');
});

test('complete adds what a schema says itself, at every level: the constants of its own properties, of the one branch the document belongs to, and of what its properties and items refer to', () => {
  const schemas = {
    'review/any.schema.json': { properties: { steps: { const: ['first', 'second'] } }, oneOf: [{ $ref: 'kinds/a.schema.json' }, { $ref: 'kinds/b.schema.json' }] },
    'review/kinds/a.schema.json': { properties: { task: { const: 'do a' }, kind: { const: 'a' }, part: { $ref: '../part.schema.json' } } },
    'review/kinds/b.schema.json': { properties: { task: { const: 'do b' }, kind: { const: 'b' }, part: { $ref: '../part.schema.json' }, items: { type: 'array', items: { $ref: '../part.schema.json#/$defs/Item' } } } },
    'review/part.schema.json': { properties: { note: { const: 'read me' }, value: { type: 'string' } }, $defs: { Item: { properties: { tag: { const: 't' }, n: { type: 'integer' } } } } },
  };
  const read = (name) => schemas[name];
  assert.deepEqual(
    complete(read, 'review/any.schema.json', { kind: 'b', part: { value: 'x' }, items: [{ n: 1 }, { n: 2 }] }),
    { steps: ['first', 'second'], task: 'do b', kind: 'b', part: { note: 'read me', value: 'x' }, items: [{ tag: 't', n: 1 }, { tag: 't', n: 2 }] },
  );
  assert.deepEqual(complete(read, 'review/any.schema.json', { kind: 'a' }), { steps: ['first', 'second'], task: 'do a', kind: 'a' });
  assert.throws(() => complete(read, 'review/any.schema.json', { kind: 'c' }), /belongs to 0 of the 2 branches/);
  assert.throws(() => complete(read, 'review/any.schema.json', {}), /belongs to 2 of the 2 branches/);
});

test('anchorInside accepts lines in the surface on their side, and the pull request', () => {
  assert.equal(anchorInside(lines('p', 3, 3, 'head'), surface), true);
  assert.equal(anchorInside(lines('p', 1, 5, 'head'), surface), true);
  assert.equal(anchorInside(lines('p', 9, 9, 'base'), surface), true);
  assert.equal(anchorInside(atPullRequest, surface), true);
  assert.equal(anchorInside(lines('p', 6, 6, 'head'), surface), false);
  assert.equal(anchorInside(lines('p', 3, 3, 'base'), surface), false);
  assert.equal(anchorInside(lines('q', 1, 1, 'head'), surface), false);
});

test('anchorInside refuses a range that ends before it starts', () => {
  assert.equal(anchorInside(lines('p', 4, 2, 'head'), surface), false);
});

test('checkLedger accepts rows matching the rules in order', () => {
  checkLedger('g', probe, { headCommit: 'h', rows: [cleanRow('A'), cleanRow('B')] });
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
  checkLedger('g', probe, { headCommit: 'h', rows: rows(lines('p', 2, 2, 'head')) });
  checkLedger('g', probe, { headCommit: 'h', rows: rows(atPullRequest) });
  assert.throws(() => checkLedger('g', probe, { headCommit: 'h', rows: rows(lines('p', 7, 7, 'head')) }), /violation of A is anchored outside the surface/);
});

test('checkLedger requires exactly three rows on rules of one ruleset the escalation probe was handed', () => {
  const rowOn = (ruleset) => ({ bookRule: { ruleset, heading: 'x' }, examined: ['x'], verdict: 'clean', evidence: 'e' });
  checkLedger('e', escalation, { headCommit: 'h', rows: [cleanBookRow('x'), cleanBookRow('y'), cleanBookRow('z')] });
  assert.throws(() => checkLedger('e', escalation, { headCommit: 'h', rows: [cleanBookRow('x')] }), /1 rows, 3 expected/);
  assert.throws(() => checkLedger('e', escalation, { headCommit: 'h', rows: [cleanBookRow('x'), cleanBookRow('y'), cleanRow('A')] }), /\["A"\] is not a rule of the ruleset/);
  assert.throws(() => checkLedger('e', escalation, { headCommit: 'h', rows: [rowOn('https://books.example/other.md'), rowOn('https://books.example/other.md'), rowOn('https://books.example/other.md')] }), /other\.md"\] is not a ruleset the probe was handed/);
  assert.throws(() => checkLedger('e', escalation, { headCommit: 'h', rows: [cleanBookRow('x'), cleanBookRow('y'), rowOn('https://books.example/clean-code.md')] }), /selects one ruleset/);
});

const ledger = {
  headCommit: 'h',
  rows: [
    violatedRow('A', [violation(lines('p', 3, 3, 'head')), violation(atPullRequest)]),
    { rule: 'B', examined: ['x'], verdict: 'clean', evidence: `has | pipe\nand newline ${'x'.repeat(CELL)}` },
  ],
};
const escalationLedger = { headCommit: 'h', rows: [violatedBookRow('Book rule', [violation(lines('p', 1, 4, 'base'))])] };
const entries = [{ document: probe, ledger }, { document: escalation, ledger: escalationLedger }];

test('merge concatenates rows into the one ledger and verdict follows any violation', () => {
  assert.deepEqual(merge([{ headCommit: 'h', rows: [cleanRow('A')] }, { headCommit: 'h', rows: [cleanBookRow('x')] }]), { headCommit: 'h', rows: [cleanRow('A'), cleanBookRow('x')] });
  assert.equal(verdict(ledger), 'REQUEST_CHANGES');
  assert.equal(verdict({ headCommit: 'h', rows: [cleanRow('A')] }), 'APPROVE');
});

test('table escapes pipes and newlines, caps a cell, and names a book rule by its heading', () => {
  const rendered = table(ledger);
  assert.match(rendered, /has \\\| pipe and newline/);
  assert.ok(rendered.split('\n')[3].length < CELL + 100);
  assert.match(rendered, /…/);
  assert.match(table(escalationLedger), /\n\| Book rule \| x \| violation \| e \|$/);
});

test('citation links the parent principle of a rule of ours on the site, and a book rule in its ruleset', () => {
  const document = { kind: 'rules', rulebook: { rules: [{ id: 'R', parent: "You aren't gonna need it" }] } };
  assert.equal(citation(document, cleanRow('R')), `[You aren't gonna need it](${SITE}#you-arent-gonna-need-it)`);
  assert.equal(citation(escalation, cleanBookRow('Book rule')), '[Book rule](https://books.example/ddd.md)');
});

test('message renders the observation as breaking what is cited', () => {
  assert.equal(message(violation(atPullRequest), citeP), `what is wrong breaks ${citeP}`);
});

test('comment maps one line, a range, and the pull request onto what the host accepts', () => {
  assert.deepEqual(comment(finding(lines('p', 3, 3, 'head'))), { path: 'p', line: 3, side: 'RIGHT', body: 'rendered' });
  assert.deepEqual(comment(finding(lines('q', 1, 4, 'base'))), { path: 'q', start_line: 1, start_side: 'LEFT', line: 4, side: 'LEFT', body: 'rendered' });
  assert.equal(comment(finding(atPullRequest)), undefined);
});

test('alreadyOpen matches an open thread on the same line citing the same principle', () => {
  const open = [{ path: 'p', line: 3, body: `earlier breaks ${citeP}` }];
  assert.equal(alreadyOpen(violation(lines('p', 3, 3, 'head')), citeP, open), true);
  assert.equal(alreadyOpen(violation(lines('p', 4, 4, 'head')), citeP, open), false);
  assert.equal(alreadyOpen(violation(lines('p', 3, 3, 'head')), `[Q](${SITE}#q)`, open), false);
  assert.equal(alreadyOpen(violation(atPullRequest), citeP, open), false);
});

test('review carries every violation as breaking what its rule protects: inline ones as comments, the rest in the body', () => {
  const payload = review(entries, { self: false, threads: [] });
  assert.equal(payload.commit_id, 'h');
  assert.equal(payload.event, 'REQUEST_CHANGES');
  assert.deepEqual(payload.comments.map((item) => item.body), [`what is wrong breaks ${citeP}`, 'what is wrong breaks [Book rule](https://books.example/ddd.md)']);
  assert.match(payload.body, /^\*\*Verdict: REQUEST_CHANGES\*\*\n/);
  assert.match(payload.body, /3 rules probed by 2 probes at h: 3 violations, 2 inline, 1 at the pull request, 0 already carried by an open thread/);
  assert.equal(payload.body.includes(`\n\nwhat is wrong breaks ${citeP}\n\n<details>`), true);
});

test('review posts a comment with the verdict when the reviewer is the author, and skips what an open thread carries', () => {
  const payload = review(entries, { self: true, threads: [{ path: 'p', line: 3, body: `earlier breaks ${citeP}` }] });
  assert.equal(payload.event, 'COMMENT');
  assert.match(payload.body, /^\*\*Verdict: REQUEST_CHANGES\*\* \(posted as a comment: the reviewer is the author\)/);
  assert.deepEqual(payload.comments.map((item) => item.body), ['what is wrong breaks [Book rule](https://books.example/ddd.md)']);
  assert.match(payload.body, /1 already carried by an open thread/);
});

test('azureDevOpsReview carries every violation on lines as a thread of its own, and the verdict, the rest, and the ledger link in one summary thread', () => {
  const text = (content) => ({ comments: [{ parentCommentId: 0, commentType: 'text', content }], status: 'active' });
  const posted = azureDevOpsReview(entries, { self: true, threads: [], ledgerUrl: 'https://ado.example/ledger.txt' });
  assert.deepEqual(posted.threads, [
    { ...text(`what is wrong breaks ${citeP}`), threadContext: { filePath: '/p', rightFileStart: { line: 3, offset: 1 }, rightFileEnd: { line: 3, offset: 1 } } },
    { ...text('what is wrong breaks [Book rule](https://books.example/ddd.md)'), threadContext: { filePath: '/p', leftFileStart: { line: 1, offset: 1 }, leftFileEnd: { line: 4, offset: 1 } } },
  ]);
  assert.deepEqual(posted.summary, text([
    '**Verdict: REQUEST_CHANGES** (posted as a comment: the reviewer is the author)',
    '3 rules probed by 2 probes at h: 3 violations, 2 inline, 1 at the pull request, 0 already carried by an open thread.',
    `what is wrong breaks ${citeP}`,
    '[Review ledger](https://ado.example/ledger.txt)',
  ].join('\n\n')));
});
