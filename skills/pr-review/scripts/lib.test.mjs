import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDiff, parseHunks, intersect, union, threadRanges, wholeSurface, narrowSurface, slug, partition, kindOf, checkKinds, rulebook, rawUrl, rulesets,
  instructions, complete, numbered, fragments, span, removedLines, tooLarge, FILE_LINES,
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
  { id: 't1', path: 'a.sh', side: 'head', lines: { start: 5, end: 5 }, state: 'open', body: 'x' },
  { id: 't2', path: 'a.sh', side: 'head', lines: { start: 8, end: 9 }, state: 'resolved-by-author', body: 'x' },
  { id: 't3', path: 'a.sh', side: 'head', lines: { start: 12, end: 12 }, state: 'resolved', body: 'x' },
  { id: 't4', path: 'b.sh', side: 'base', lines: { start: 2, end: 2 }, state: 'open', body: 'x' },
];

test('threadRanges keeps open threads and threads the author resolved, by side', () => {
  const sides = threadRanges(threads);
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
  assert.deepEqual(narrowSurface(changeSet, changedSince, threadRanges(threads)), {
    files: [
      { path: 'a.sh', added: [{ start: 5, end: 5 }, { start: 8, end: 9 }, { start: 15, end: 20 }], removed: [] },
      { path: 'b.sh', added: [], removed: [{ start: 2, end: 2 }] },
    ],
  });
});

test('slug derives the anchor the site uses', () => {
  assert.equal(slug('Demonstrable, not recalled'), 'demonstrable-not-recalled');
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

test('kindOf names the probe a group gets: reuse, dead code, or a probe of rules', () => {
  assert.equal(kindOf('Reuse'), 'reuse');
  assert.equal(kindOf('Dead Code'), 'dead-code');
  assert.equal(kindOf('Failure Handling'), 'rules');
});

test('checkKinds refuses rules that lack a group a kind of probe is tied to', () => {
  assert.equal(checkKinds(['Reuse', 'Dead Code', 'Failure Handling']), undefined);
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

test('rulesets folds the index and the text read for each entry into what the context probe is handed', () => {
  const index = [{ id: 'ddd', title: 'Domain-Driven Design', author: 'Eric Evans', focus: 'Domain Modeling', when_to_use: 'Strategic modeling.', review_checklist: 'Guard aggregates.', tree_url: 'https://books.example/ddd', canonical_url: 'https://books.example/ddd.md' }];
  assert.deepEqual(rulesets(index, new Map([['https://books.example/ddd.md', '# Rules']])), [
    { url: 'https://books.example/ddd.md', title: 'Domain-Driven Design', focus: 'Domain Modeling', whenToUse: 'Strategic modeling.', text: '# Rules' },
  ]);
  assert.throws(() => rulesets(index, new Map()), /ddd\.md was not read/);
});

test('instructions hands every probe the review with its ledger file and its report command, a rule probe its rulebook, the probes that look beyond the change the checkout, and the context probe the rulesets', () => {
  const context = {
    review: { headCommit: 'h', files: [] },
    ledger: (name) => `/w/ledger/${name}.json`,
    report: (name) => `validate /w/ledger/${name}.json`,
    checkout: '/w/snapshot',
  };
  const probes = [{ name: 'g1', kind: 'rules', rulebook: 'r1' }, { name: 'g2', kind: 'reuse', rulebook: 'r2' }, { name: 'g3', kind: 'dead-code', rulebook: 'r3' }];
  const files = instructions(context, probes, ['a ruleset']);
  const handed = (name) => ({ headCommit: 'h', files: [], ledger: `/w/ledger/${name}.json`, report: `validate /w/ledger/${name}.json` });
  assert.deepEqual(files.map((file) => file.name), ['01-g1', '02-g2', '03-g3', '04-context']);
  assert.deepEqual(files[0].document, { kind: 'rules', review: handed('01-g1'), rulebook: 'r1' });
  assert.deepEqual(files[1].document, { kind: 'reuse', review: handed('02-g2'), rulebook: 'r2', checkout: '/w/snapshot' });
  assert.deepEqual(files[2].document, { kind: 'dead-code', review: handed('03-g3'), rulebook: 'r3', checkout: '/w/snapshot' });
  assert.deepEqual(files[3].document, { kind: 'context', review: handed('04-context'), rulesets: ['a ruleset'] });
});

test('numbered, fragments, span, removedLines, complete, and tooLarge behave deterministically', () => {
  assert.deepEqual(numbered('#!/usr/bin/env bash\nset -euo pipefail\n'), { 1: '#!/usr/bin/env bash', 2: 'set -euo pipefail' });
  assert.deepEqual(numbered('a\n\nb'), { 1: 'a', 2: '', 3: 'b' });
  assert.deepEqual(numbered(''), {});
  assert.deepEqual(Object.keys(numbered('x\n'.repeat(12))).at(-1), '12');
  const numberedLines = numbered('a\nb\nc\nd\n');
  assert.deepEqual(fragments(numberedLines, [{ start: 2, end: 3 }], [{ start: 7, end: 8, content: 'x\ny' }]), [
    { kind: 'context', lines: { 1: 'a' } },
    { kind: 'surface', side: 'head', lines: { 2: 'b', 3: 'c' } },
    { kind: 'context', lines: { 4: 'd' } },
    { kind: 'surface', side: 'base', lines: { 7: 'x', 8: 'y' } },
  ]);
  assert.deepEqual(span({ 3: 'c', 4: 'd', 10: 'j' }), { start: 3, end: 10 });
  const hunks = [{ start: 10, end: 13, content: 'a\nb\nc\nd' }, { start: 30, end: 30, content: 'z' }];
  assert.deepEqual(removedLines(hunks, [{ start: 11, end: 12 }, { start: 30, end: 30 }]), [{ start: 11, end: 12, content: 'b\nc' }, { start: 30, end: 30, content: 'z' }]);
  assert.throws(() => removedLines(hunks, [{ start: 20, end: 20 }]), /no removed hunk holds lines 20-20/);
  assert.deepEqual(tooLarge([{ path: 'a.cs', lines: 201 }, { path: 'b.cs', lines: 200 }, { path: 'c.cs', lines: 0 }]), ['a.cs is 201 lines long, which breaks File too large']);
  assert.equal(FILE_LINES, 200);
});
