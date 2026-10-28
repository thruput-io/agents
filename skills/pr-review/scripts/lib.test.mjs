import test from 'node:test';
import assert from 'node:assert/strict';
import {
  intersect, union, threadRanges, wholeSurface, narrowSurface, slug, partition, kindOf, checkKinds, rulebook,
  instructions, numbered, fragments, span, removedLines, settled, merge, verdict, table, citation, message, alreadyOpen,
  outcome, ours, tooLarge, FILE_TOO_LARGE, FILE_LINES, isTest, CELL, SITE,
} from './lib.mjs';

const H = 'a'.repeat(40);

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
  headCommit: H,
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

test('kindOf names the probe a group gets: reuse, dead code, or a probe of rules', () => {
  assert.equal(kindOf('Reuse'), 'reuse');
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

test('instructions hands every probe the review with its ledger file and its report command, a rule probe its rulebook, the probes that look beyond the change the checkout, and the context probe the rulesets', () => {
  const context = {
    review: { headCommit: H, files: [] },
    ledger: (name) => `/w/ledger/${name}.json`,
    report: (name) => `validate /w/ledger/${name}.json`,
    checkout: '/w/snapshot',
  };
  const probes = [{ name: 'g1', kind: 'rules', rulebook: 'r1' }, { name: 'g2', kind: 'reuse', rulebook: 'r2' }, { name: 'g3', kind: 'dead-code', rulebook: 'r3' }];
  const files = instructions(context, probes, ['a ruleset']);
  const handed = (name) => ({ headCommit: H, files: [], ledger: `/w/ledger/${name}.json`, report: `validate /w/ledger/${name}.json` });
  assert.deepEqual(files.map((file) => file.name), ['01-g1', '02-g2', '03-g3', '04-context']);
  assert.deepEqual(files[0].document, { kind: 'rules', review: handed('01-g1'), rulebook: 'r1' });
  assert.deepEqual(files[1].document, { kind: 'reuse', review: handed('02-g2'), rulebook: 'r2', checkout: '/w/snapshot' });
  assert.deepEqual(files[2].document, { kind: 'dead-code', review: handed('03-g3'), rulebook: 'r3', checkout: '/w/snapshot' });
  assert.deepEqual(files[3].document, { kind: 'context', review: handed('04-context'), rulesets: ['a ruleset'] });
});

const text = (side, n) => `${side === 'head' ? 'L' : 'R'}${n}`;
const run = (side, from, to) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, text(side, from + i)]));
const files = [{ path: 'p', fragments: [
  { kind: 'surface', side: 'head', lines: run('head', 1, 5) },
  { kind: 'context', lines: run('head', 6, 8) },
  { kind: 'surface', side: 'base', lines: run('base', 9, 9) },
] }];
const probe = { kind: 'rules', review: { headCommit: H, files }, rulebook: { rules: [{ id: 'A', parent: 'P' }, { id: 'B', parent: 'Q' }] } };
const contextProbe = { kind: 'context', review: { headCommit: H, files }, rulesets: [{ url: 'https://books.example/ddd.md' }, { url: 'https://books.example/clean-code.md' }] };
const lines = (path, start, end, side) => ({ kind: 'surface', path, side, lines: run(side, start, end) });
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

test('fragments cuts a file into context and surface fragments in order, head first, then the removed hunks as base fragments', () => {
  const numberedLines = numbered('a\nb\nc\nd\n');
  assert.deepEqual(fragments(numberedLines, [{ start: 2, end: 3 }], [{ start: 7, end: 8, content: 'x\ny' }]), [
    { kind: 'context', lines: { 1: 'a' } },
    { kind: 'surface', side: 'head', lines: { 2: 'b', 3: 'c' } },
    { kind: 'context', lines: { 4: 'd' } },
    { kind: 'surface', side: 'base', lines: { 7: 'x', 8: 'y' } },
  ]);
  assert.deepEqual(fragments({}, [], [{ start: 1, end: 1, content: 'gone' }]), [{ kind: 'surface', side: 'base', lines: { 1: 'gone' } }]);
  assert.deepEqual(fragments(numbered('a\n'), [{ start: 1, end: 1 }], []), [{ kind: 'surface', side: 'head', lines: { 1: 'a' } }]);
});

test('span is the first and last line an anchor or a fragment covers', () => {
  assert.deepEqual(span({ 3: 'c', 4: 'd', 10: 'j' }), { start: 3, end: 10 });
});

const ledger = {
  headCommit: H,
  rows: [
    violatedRow('A', [violation(lines('p', 3, 3, 'head')), violation(atPullRequest)]),
    { rule: 'B', examined: ['x'], verdict: 'clean', evidence: `has | pipe\nand newline ${'x'.repeat(CELL)}` },
  ],
};
const contextLedger = { headCommit: H, rows: [violatedBookRow('Book rule', [violation(lines('p', 9, 9, 'base'))])] };
const entries = [{ document: probe, ledger }, { document: contextProbe, ledger: contextLedger }];

test('merge concatenates rows into the one ledger and verdict follows any violation', () => {
  assert.deepEqual(merge([{ headCommit: H, rows: [cleanRow('A')] }, { headCommit: H, rows: [cleanBookRow('x')] }]), { headCommit: H, rows: [cleanRow('A'), cleanBookRow('x')] });
  assert.equal(verdict(ledger), 'request-changes');
  assert.equal(verdict({ headCommit: H, rows: [cleanRow('A')] }), 'approve');
});

test('table escapes pipes and newlines, caps a cell, and names a book rule by its heading', () => {
  const rendered = table(ledger);
  assert.match(rendered, /has \\\| pipe and newline/);
  assert.ok(rendered.split('\n')[3].length < CELL + 100);
  assert.match(rendered, /…/);
  assert.match(table(contextLedger), /\n\| Book rule \| x \| violation \| e \|$/);
});

test('citation links the parent principle of a rule of ours on the site, and a book rule in its ruleset', () => {
  const document = { kind: 'rules', rulebook: { rules: [{ id: 'R', parent: "You aren't gonna need it" }] } };
  assert.equal(citation(document, cleanRow('R')), `[You aren't gonna need it](${SITE}#you-arent-gonna-need-it)`);
  assert.equal(citation(contextProbe, cleanBookRow('Book rule')), '[Book rule](https://books.example/ddd.md)');
});

test('message renders the observation as breaking what is cited', () => {
  assert.equal(message(violation(atPullRequest), citeP), `what is wrong breaks ${citeP}`);
});

test('alreadyOpen matches an open thread on the same line citing the same principle', () => {
  const open = [{ path: 'p', lines: { start: 3, end: 3 }, body: `earlier breaks ${citeP}` }];
  assert.equal(alreadyOpen(violation(lines('p', 3, 3, 'head')), citeP, open), true);
  assert.equal(alreadyOpen(violation(lines('p', 4, 4, 'head')), citeP, open), false);
  assert.equal(alreadyOpen(violation(lines('p', 3, 3, 'head')), `[Q](${SITE}#q)`, open), false);
  assert.equal(alreadyOpen(violation(atPullRequest), citeP, open), false);
});

test('settled lists the open threads of ours that no finding of this review carries any more: the fixed ones', () => {
  const document = { kind: 'rules', rulebook: { rules: [{ id: 'R', parent: 'P' }], principles: [{ id: 'P' }], definitions: [] } };
  const violation = { observation: 'x', anchor: { kind: 'surface', path: 'a.sh', side: 'head', lines: { 3: 'c', 4: 'd' } } };
  const ledger = { headCommit: H, rows: [{ rule: 'R', verdict: 'violation', examined: ['a.sh'], evidence: 'e', violations: [violation] }] };
  const threads = [
    { id: 1, path: 'a.sh', lines: { start: 4, end: 4 }, body: message(violation, citation(document, ledger.rows[0])) },
    { id: 2, path: 'a.sh', lines: { start: 9, end: 9 }, body: message(violation, citation(document, ledger.rows[0])) },
    { id: 3, path: 'b.sh', lines: { start: 1, end: 1 }, body: 'something else breaks [P](https://thruput.se/agents/#p)' },
  ];
  assert.deepEqual(settled([{ document, ledger }], threads).map((thread) => thread.id), [2, 3]);
});

test('outcome is host-neutral: the verdict, a summary that names the site, every fresh inline finding with its anchor, the threads to settle, and the threads to reopen', () => {
  const open = { id: 'o', path: 'p', side: 'head', lines: { start: 3, end: 3 }, state: 'open', body: `earlier breaks ${citeP}` };
  const gone = { id: 'g', path: 'p', side: 'head', lines: { start: 7, end: 7 }, state: 'open', body: `earlier breaks ${citeP}` };
  const resolved = { id: 'r', path: 'p', side: 'base', lines: { start: 9, end: 9 }, state: 'resolved-by-author', body: 'earlier breaks [Book rule](https://books.example/ddd.md)' };
  const result = outcome(entries, [open, gone, resolved]);
  assert.equal(result.headCommit, H);
  assert.equal(result.verdict, 'request-changes');
  assert.match(result.summary, /^\*\*Verdict: request-changes\*\*\n/);
  assert.match(result.summary, /3 rules probed by 2 probes at a{40} against \[the rules\]\(https:\/\/thruput\.se\/agents\/\): 3 violations, 0 inline, 1 at the pull request, 2 already carried by a thread/);
  assert.equal(result.summary.includes(`\n\nwhat is wrong breaks ${citeP}`), true);
  assert.deepEqual(result.inline, []);
  assert.deepEqual(result.settle, ['g']);
  assert.deepEqual(result.reopen, ['r']);
  const fresh = outcome(entries, []);
  assert.deepEqual(fresh.inline, [
    { path: 'p', side: 'head', lines: { start: 3, end: 3 }, body: `what is wrong breaks ${citeP}` },
    { path: 'p', side: 'base', lines: { start: 9, end: 9 }, body: 'what is wrong breaks [Book rule](https://books.example/ddd.md)' },
  ]);
  assert.equal(outcome([{ document: probe, ledger: { headCommit: H, rows: [cleanRow('R1'), cleanRow('R2')] } }], []).verdict, 'approve');
});

test('ours recognises what this review writes: a finding rendered by the template whatever it cites, and a summary or refusal naming the site', () => {
  assert.equal(ours(`what is wrong breaks ${citeP}`), true);
  assert.equal(ours('what is wrong breaks [Timeouts Are Mandatory](https://github.com/ciembor/agent-rules-books/blob/main/x.md)'), true);
  assert.equal(ours(`**Verdict: approve**\n\n3 rules probed by 2 probes at h against [the rules](${SITE}): 0 violations`), true);
  assert.equal(ours('Policy status has been updated'), false);
  assert.equal(ours('LGTM, breaks nothing'), false);
});

test('removedLines cuts the removed lines the surface keeps out of the hunks that carry their text', () => {
  const hunks = [{ start: 10, end: 13, content: 'a\nb\nc\nd' }, { start: 30, end: 30, content: 'z' }];
  assert.deepEqual(removedLines(hunks, [{ start: 11, end: 12 }, { start: 30, end: 30 }]), [{ start: 11, end: 12, content: 'b\nc' }, { start: 30, end: 30, content: 'z' }]);
  assert.deepEqual(removedLines(hunks, []), []);
  assert.throws(() => removedLines(hunks, [{ start: 20, end: 20 }]), /no removed hunk holds lines 20-20/);
});

test('tooLarge names every changed production file over the limit as a reason to refuse the review, skipping test files', () => {
  assert.deepEqual(tooLarge([
    { path: 'a.cs', lines: 201 },
    { path: 'b.cs', lines: 200 },
    { path: 'c.cs', lines: 0 },
    { path: 'a.test.cs', lines: 350 },
    { path: 'tests/OrderTests.cs', lines: 300 },
    { path: 'src/App.Tests/ServiceTests.cs', lines: 250 },
  ]), ['a.cs is 201 lines long, which breaks File too large']);
  assert.deepEqual(tooLarge([]), []);
  assert.equal(FILE_LINES, 200);
});

test('isTest identifies test files and directories while ignoring production code', () => {
  assert.equal(isTest('test/foo.cs'), true);
  assert.equal(isTest('tests/foo.cs'), true);
  assert.equal(isTest('src/MyProject.Tests/foo.cs'), true);
  assert.equal(isTest('foo.test.ts'), true);
  assert.equal(isTest('foo.spec.js'), true);
  assert.equal(isTest('foo_test.go'), true);
  assert.equal(isTest('test_foo.py'), true);
  assert.equal(isTest('OrderServiceTests.cs'), true);
  assert.equal(isTest('OrderServiceTest.cs'), true);
  assert.equal(isTest('contest.cs'), false);
  assert.equal(isTest('latest.js'), false);
  assert.equal(isTest('attest.ts'), false);
  assert.equal(isTest('service.cs'), false);
});
