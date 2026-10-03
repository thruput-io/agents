import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDiff, parseHunks, intersect, union, threadRanges, narrowSurface, slug, partition, instructions,
  checkLedger, merge, verdict, table, comment, review,
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

test('instructions writes one probe per group and one escalation, each with its ledger path', () => {
  const context = { probe: { ruleSource: 'r/', site: 's/' }, shared: { checkout: '/c', changeSet: { headCommit: 'h', files: [] } }, ledger: (name) => `/w/ledger/${name}.json` };
  const files = instructions(context, partition(rules), '/i.md');
  assert.deepEqual(files.map((file) => file.name), ['01-g1', '02-g2', '03-escalation']);
  assert.deepEqual(files[0].document, { group: 'G1', rules: [rules[0], rules[2]], ruleSource: 'r/', site: 's/', checkout: '/c', changeSet: { headCommit: 'h', files: [] }, ledger: '/w/ledger/01-g1.json' });
  assert.deepEqual(files[2].document, { escalation: { index: '/i.md' }, checkout: '/c', changeSet: { headCommit: 'h', files: [] }, ledger: '/w/ledger/03-escalation.json' });
});

const probe = { rules: [{ id: 'A' }, { id: 'B' }], changeSet: { headCommit: 'h' } };
const row = (rule, extra = {}) => ({ rule, examined: ['x'], verdict: 'clean', evidence: 'e', ...extra });

test('checkLedger accepts rows matching the rules in order', () => {
  checkLedger('g', probe, { headCommit: 'h', rows: [row('A'), row('B')] });
});

test('checkLedger rejects a missing, extra, reordered, or foreign-commit ledger', () => {
  assert.throws(() => checkLedger('g', probe, { headCommit: 'h', rows: [row('A')] }), /missing: \["B"\]/);
  assert.throws(() => checkLedger('g', probe, { headCommit: 'h', rows: [row('A'), row('B'), row('Z')] }), /extra: \["Z"\]/);
  assert.throws(() => checkLedger('g', probe, { headCommit: 'h', rows: [row('B'), row('A')] }), /in order/);
  assert.throws(() => checkLedger('g', probe, { headCommit: 'other', rows: [row('A'), row('B')] }), /ledger is for other/);
});

test('checkLedger requires exactly three escalation rows', () => {
  const escalation = { escalation: { index: 'i' }, changeSet: { headCommit: 'h' } };
  checkLedger('e', escalation, { headCommit: 'h', rows: [row('x'), row('y'), row('z')] });
  assert.throws(() => checkLedger('e', escalation, { headCommit: 'h', rows: [row('x')] }), /1 rows, 3 expected/);
});

const violation = (anchor) => ({ rule: 'A', body: 'what is wrong', anchor });
const ledger = {
  headCommit: 'h',
  rows: [
    row('A', { verdict: 'violation', violations: [violation({ path: 'p', line: 3, side: 'RIGHT' }), violation({ pullRequest: true })] }),
    row('B', { evidence: 'has | pipe\nand newline' }),
    row('C', { verdict: 'violation', violations: [violation({ path: 'q', lines: { start: 1, end: 4 }, side: 'LEFT' })] }),
  ],
};

test('merge concatenates rows and verdict follows any violation', () => {
  assert.deepEqual(merge([{ headCommit: 'h', rows: [row('A')] }, { headCommit: 'h', rows: [row('B')] }]), { headCommit: 'h', rows: [row('A'), row('B')] });
  assert.equal(verdict(ledger), 'REQUEST_CHANGES');
  assert.equal(verdict({ headCommit: 'h', rows: [row('A')] }), 'APPROVE');
});

test('table escapes pipes and newlines', () => {
  assert.match(table(ledger), /has \\\| pipe and newline/);
});

test('comment maps a line, a range, and the pull request', () => {
  assert.deepEqual(comment(violation({ path: 'p', line: 3, side: 'RIGHT' })), { path: 'p', line: 3, side: 'RIGHT', body: 'what is wrong' });
  assert.deepEqual(comment(violation({ path: 'q', lines: { start: 1, end: 4 }, side: 'LEFT' })), { path: 'q', start_line: 1, start_side: 'LEFT', line: 4, side: 'LEFT', body: 'what is wrong' });
  assert.equal(comment(violation({ pullRequest: true })), undefined);
});

test('review carries every violation: inline ones as comments, the rest in the body', () => {
  const payload = review(ledger, 2);
  assert.equal(payload.commit_id, 'h');
  assert.equal(payload.event, 'REQUEST_CHANGES');
  assert.equal(payload.comments.length, 2);
  assert.match(payload.body, /3 rules probed by 2 probes at h: 3 violations, 2 inline, 1 at the pull request/);
  assert.match(payload.body, /<details>\n<summary>Review ledger<\/summary>\n\n\| rule \|/);
});
