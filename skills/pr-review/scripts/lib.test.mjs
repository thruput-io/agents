import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDiff, parseHunks, intersect, union, threadRanges, narrowSurface, slug, partition, definitions, callSites, deadCode, instructions,
  anchorInside, checkLedger, merge, verdict, table, comment, citation, message, alreadyOpen, review, CELL,
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

test('parseDiff numbers added lines at head and removed lines at base, per file', () => {
  assert.deepEqual(parseDiff(diff), [
    { path: 'scripts/verify.sh', added: [{ start: 19, end: 20 }], removed: [{ start: 19, end: 19 }] },
    { path: 'web/_includes/chain.html', added: [{ start: 1, end: 2 }], removed: [] },
    { path: 'gone.txt', added: [], removed: [{ start: 1, end: 3 }] },
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

test('threadRanges keeps unresolved threads and threads the author resolved, per side', () => {
  const sides = threadRanges(threads, 'author');
  assert.deepEqual([...sides.RIGHT], [['a.sh', [{ start: 5, end: 5 }, { start: 8, end: 9 }]]]);
  assert.deepEqual([...sides.LEFT], [['b.sh', [{ start: 2, end: 2 }]]]);
});

test('narrowSurface keeps change-set lines that changed since the prior review or carry a thread', () => {
  const changeSet = {
    headCommit: 'h',
    files: [
      { path: 'a.sh', added: [{ start: 1, end: 20 }], removed: [] },
      { path: 'b.sh', added: [{ start: 1, end: 1 }], removed: [{ start: 1, end: 4 }] },
      { path: 'd.sh', added: [{ start: 1, end: 9 }], removed: [] },
    ],
  };
  const changedSince = new Map([['a.sh', [{ start: 15, end: 30 }]]]);
  assert.deepEqual(narrowSurface(changeSet, changedSince, threadRanges(threads, 'author')), {
    headCommit: 'h',
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

test('definitions names what the changed lines define: functions, classes, shell functions, ids', () => {
  const text = [
    '--- a/x', '+++ b/x',
    '+export function parseDiff(text) {',
    '-class Old {',
    '+  const inner = 1;',
    '+remove_site() {',
    '+- id: Delete unused',
    ' def untouched():',
  ].join('\n');
  assert.deepEqual(definitions(text), { added: ['parseDiff', 'inner', 'remove_site', 'Delete unused'], removed: ['Old'] });
});

test('callSites finds the files that mention a changed file or its definitions, and the files a changed file mentions', () => {
  const files = {
    'scripts/lib.mjs': 'export function parseDiff() {}',
    'scripts/prepare.mjs': "import { parseDiff } from './lib.mjs';",
    'docs/notes.md': 'parseDiffer is not a call, nor is lib.mjs.bak',
    'web/index.html': '{% include chain.html %}',
    'web/_includes/chain.html': '{% include anchor.html id=x %}',
    'web/_includes/anchor.html': 'slug',
    'logo.png': 'PNG\0binary parseDiff',
    'rules/Rules.yaml': '- id: Delete unused',
    'rules/Principles.yaml': 'cites [[Delete unused]]',
  };
  const read = (path) => files[path];
  const sites = callSites(['scripts/lib.mjs', 'web/_includes/chain.html', 'rules/Rules.yaml', 'gone.txt'], ['parseDiff', 'Delete unused'], Object.keys(files), read);
  assert.deepEqual(sites.into, ['scripts/prepare.mjs', 'web/index.html', 'rules/Principles.yaml']);
  assert.deepEqual(sites.outOf, ['web/_includes/anchor.html']);
});

test('deadCode reports definitions nothing uses, references whose definition is gone, and definitions the change orphaned', () => {
  const diff = [
    '--- a/scripts/lib.mjs', '+++ b/scripts/lib.mjs',
    '+export function fresh() {}',
    '+export function wired() {}',
    '-export function gone() {}',
    '-  return helper(count);',
    '-  cites [[Delete unused]]',
  ].join('\n');
  const files = {
    'scripts/lib.mjs': 'export function fresh() {}\nexport function wired() {}\nexport function helper() {}\nexport function count() {}',
    'scripts/prepare.mjs': "import { wired, count } from './lib.mjs'; gone();",
    'rules/Rules.yaml': '- id: Delete unused',
    'rules/Principles.yaml': 'nothing here',
    'logo.png': 'PNG\0 fresh gone helper',
  };
  const read = (path) => files[path];
  assert.deepEqual(deadCode(diff, Object.keys(files), read), {
    unusedDefinitions: [{ name: 'fresh', definedIn: ['scripts/lib.mjs'] }],
    danglingReferences: [{ name: 'gone', usedIn: ['scripts/prepare.mjs'] }],
    orphanedDefinitions: [{ name: 'helper', definedIn: ['scripts/lib.mjs'] }, { name: 'Delete unused', definedIn: ['rules/Rules.yaml'] }],
  });
});

test('instructions writes one probe per group and one escalation, each with its ledger path', () => {
  const context = { probe: { ruleSource: 'r/', site: 's/' }, shared: { reading: { files: '/w/files', diff: '/w/changes.diff', tree: '/w/tree.txt' }, changeSet: { headCommit: 'h', files: [] } }, ledger: (name) => `/w/ledger/${name}.json` };
  const files = instructions(context, partition(rules), '/i.md');
  assert.deepEqual(files.map((file) => file.name), ['01-g1', '02-g2', '03-escalation']);
  assert.deepEqual(files[0].document, { group: 'G1', rules: [rules[0], rules[2]], ruleSource: 'r/', site: 's/', reading: { files: '/w/files', diff: '/w/changes.diff', tree: '/w/tree.txt' }, changeSet: { headCommit: 'h', files: [] }, ledger: '/w/ledger/01-g1.json' });
  assert.deepEqual(files[2].document, { escalation: { index: '/i.md' }, reading: { files: '/w/files', diff: '/w/changes.diff', tree: '/w/tree.txt' }, changeSet: { headCommit: 'h', files: [] }, ledger: '/w/ledger/03-escalation.json' });
});

const surface = { headCommit: 'h', files: [{ path: 'p', added: [{ start: 1, end: 5 }], removed: [{ start: 9, end: 9 }] }] };
const probe = { rules: [{ id: 'A', parent: 'P' }, { id: 'B', parent: 'Q' }], changeSet: { headCommit: 'h' }, surface, site: 's/' };
const row = (rule, extra = {}) => ({ rule, examined: ['x'], verdict: 'clean', evidence: 'e', ...extra });
const violation = (anchor, rule = 'A') => ({ rule, observation: 'what is wrong', anchor });
const finding = (anchor) => ({ ...violation(anchor), body: 'rendered' });

test('anchorInside accepts lines in the surface on their side, and the pull request', () => {
  assert.equal(anchorInside({ path: 'p', line: 3, side: 'RIGHT' }, surface), true);
  assert.equal(anchorInside({ path: 'p', lines: { start: 1, end: 5 }, side: 'RIGHT' }, surface), true);
  assert.equal(anchorInside({ path: 'p', line: 9, side: 'LEFT' }, surface), true);
  assert.equal(anchorInside({ pullRequest: true }, surface), true);
  assert.equal(anchorInside({ path: 'p', line: 6, side: 'RIGHT' }, surface), false);
  assert.equal(anchorInside({ path: 'p', line: 3, side: 'LEFT' }, surface), false);
  assert.equal(anchorInside({ path: 'q', line: 1, side: 'RIGHT' }, surface), false);
});

test('checkLedger accepts rows matching the rules in order', () => {
  checkLedger('g', probe, { headCommit: 'h', rows: [row('A'), row('B')] });
});

test('checkLedger rejects a missing, extra, reordered, or foreign-commit ledger', () => {
  assert.throws(() => checkLedger('g', probe, { headCommit: 'h', rows: [row('A')] }), /missing: \["B"\]/);
  assert.throws(() => checkLedger('g', probe, { headCommit: 'h', rows: [row('A'), row('B'), row('Z')] }), /extra: \["Z"\]/);
  assert.throws(() => checkLedger('g', probe, { headCommit: 'h', rows: [row('B'), row('A')] }), /in order/);
  assert.throws(() => checkLedger('g', probe, { headCommit: 'other', rows: [row('A'), row('B')] }), /ledger is for other/);
});

test('checkLedger rejects a violation filed under another rule or anchored outside the surface', () => {
  const rows = (anchor, rule) => [row('A', { verdict: 'violation', evidence: 'f', violations: [violation(anchor, rule)] }), row('B')];
  checkLedger('g', probe, { headCommit: 'h', rows: rows({ path: 'p', line: 2, side: 'RIGHT' }) });
  checkLedger('g', probe, { headCommit: 'h', rows: rows({ pullRequest: true }) });
  assert.throws(() => checkLedger('g', probe, { headCommit: 'h', rows: rows({ path: 'p', line: 2, side: 'RIGHT' }, 'B') }), /violation of B sits in the row of A/);
  assert.throws(() => checkLedger('g', probe, { headCommit: 'h', rows: rows({ path: 'p', line: 7, side: 'RIGHT' }) }), /outside the surface/);
});

test('checkLedger requires exactly three escalation rows', () => {
  const escalation = { escalation: { index: 'i' }, changeSet: { headCommit: 'h' }, surface };
  checkLedger('e', escalation, { headCommit: 'h', rows: [row('x'), row('y'), row('z')] });
  assert.throws(() => checkLedger('e', escalation, { headCommit: 'h', rows: [row('x')] }), /1 rows, 3 expected/);
});

const ledger = {
  headCommit: 'h',
  rows: [
    row('A', { verdict: 'violation', violations: [violation({ path: 'p', line: 3, side: 'RIGHT' }), violation({ pullRequest: true })] }),
    row('B', { evidence: `has | pipe\nand newline ${'x'.repeat(CELL)}` }),
  ],
};
const escalationLedger = { headCommit: 'h', rows: [row('Book rule', { verdict: 'violation', violations: [violation({ path: 'p', lines: { start: 1, end: 4 }, side: 'LEFT' }, 'Book rule')] })] };
const escalation = { escalation: { index: 'i' }, changeSet: { headCommit: 'h' }, surface };
const entries = [{ document: probe, ledger }, { document: escalation, ledger: escalationLedger }];

test('merge concatenates rows and verdict follows any violation', () => {
  assert.deepEqual(merge([{ headCommit: 'h', rows: [row('A')] }, { headCommit: 'h', rows: [row('B')] }]), { headCommit: 'h', rows: [row('A'), row('B')] });
  assert.equal(verdict(ledger), 'REQUEST_CHANGES');
  assert.equal(verdict({ headCommit: 'h', rows: [row('A')] }), 'APPROVE');
});

test('table escapes pipes and newlines and caps a cell', () => {
  const rendered = table(ledger);
  assert.match(rendered, /has \\\| pipe and newline/);
  assert.ok(rendered.split('\n')[3].length < CELL + 100);
  assert.match(rendered, /…/);
});

test('citation links the parent principle of a rule of ours to the site and leaves a book rule as the probe wrote it', () => {
  assert.equal(citation({ rules: [{ id: 'R', parent: "You aren't gonna need it" }], site: 's/' }, 'R'), "[You aren't gonna need it](s/#you-arent-gonna-need-it)");
  assert.equal(citation(escalation, 'Book rule'), 'Book rule');
});

test('message renders the observation as breaking the cited principle, and keeps a book rule in front of its observation', () => {
  assert.equal(message(probe, violation({ pullRequest: true }), '[P](s/#p)'), 'what is wrong breaks [P](s/#p)');
  assert.equal(message(escalation, violation({ pullRequest: true }, 'Book rule'), 'Book rule'), 'Book rule: what is wrong');
});

test('comment maps a line, a range, and the pull request', () => {
  assert.deepEqual(comment(finding({ path: 'p', line: 3, side: 'RIGHT' })), { path: 'p', line: 3, side: 'RIGHT', body: 'rendered' });
  assert.deepEqual(comment(finding({ path: 'q', lines: { start: 1, end: 4 }, side: 'LEFT' })), { path: 'q', start_line: 1, start_side: 'LEFT', line: 4, side: 'LEFT', body: 'rendered' });
  assert.equal(comment(finding({ pullRequest: true })), undefined);
});

test('alreadyOpen matches an open thread on the same line citing the same principle', () => {
  const threads = [{ path: 'p', line: 3, body: 'earlier breaks [P](s/#p)' }];
  assert.equal(alreadyOpen(violation({ path: 'p', line: 3, side: 'RIGHT' }), '[P](s/#p)', threads), true);
  assert.equal(alreadyOpen(violation({ path: 'p', line: 4, side: 'RIGHT' }), '[P](s/#p)', threads), false);
  assert.equal(alreadyOpen(violation({ path: 'p', line: 3, side: 'RIGHT' }), '[Q](s/#q)', threads), false);
  assert.equal(alreadyOpen(violation({ pullRequest: true }), '[P](s/#p)', threads), false);
});

test('review carries every violation as breaking its principle: inline ones as comments, the rest in the body', () => {
  const payload = review(entries, { self: false, threads: [] });
  assert.equal(payload.commit_id, 'h');
  assert.equal(payload.event, 'REQUEST_CHANGES');
  assert.deepEqual(payload.comments.map((item) => item.body), ['what is wrong breaks [P](s/#p)', 'Book rule: what is wrong']);
  assert.match(payload.body, /^\*\*Verdict: REQUEST_CHANGES\*\*\n/);
  assert.match(payload.body, /3 rules probed by 2 probes at h: 3 violations, 2 inline, 1 at the pull request, 0 already carried by an open thread/);
  assert.match(payload.body, /\n\nwhat is wrong breaks \[P\]\(s\/#p\)\n\n<details>/);
});

test('review posts a comment with the verdict when the reviewer is the author, and skips what an open thread carries', () => {
  const payload = review(entries, { self: true, threads: [{ path: 'p', line: 3, body: 'earlier breaks [P](s/#p)' }] });
  assert.equal(payload.event, 'COMMENT');
  assert.match(payload.body, /^\*\*Verdict: REQUEST_CHANGES\*\* \(posted as a comment: the reviewer is the author\)/);
  assert.deepEqual(payload.comments.map((item) => item.body), ['Book rule: what is wrong']);
  assert.match(payload.body, /1 already carried by an open thread/);
});
