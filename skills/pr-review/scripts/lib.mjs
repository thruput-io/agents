import { ruleName } from "./domain/ledger.ts";
export function intersect(a, b) {
  const result = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start, b[j].start);
    const end = Math.min(a[i].end, b[j].end);
    if (start <= end) result.push({ start, end });
    if (a[i].end < b[j].end) i += 1;
    else j += 1;
  }
  return result;
}

export function union(a, b) {
  const sorted = [...a, ...b].sort((x, y) => x.start - y.start);
  const result = [];
  for (const range of sorted) {
    const last = result[result.length - 1];
    if (last && range.start <= last.end + 1) last.end = Math.max(last.end, range.end);
    else result.push({ ...range });
  }
  return result;
}

export function threadRanges(threads) {
  const sides = { head: new Map(), base: new Map() };
  for (const thread of threads.filter((candidate) => candidate.state !== 'resolved')) {
    const side = sides[thread.side];
    side.set(thread.path, union(side.get(thread.path) ?? [], [thread.lines]));
  }
  return sides;
}

const numbersOnly = (ranges) => ranges.map(({ start, end }) => ({ start, end }));

export function wholeSurface(changeSet) {
  return { files: changeSet.files.map((file) => ({ path: file.path, added: file.added, removed: numbersOnly(file.removed) })) };
}

export function narrowSurface(changeSet, changedSince, threads) {
  const files = changeSet.files.map((file) => ({
    path: file.path,
    added: intersect(file.added, union(changedSince.get(file.path) ?? [], threads.head.get(file.path) ?? [])),
    removed: intersect(file.removed, threads.base.get(file.path) ?? []),
  })).filter((file) => file.added.length + file.removed.length > 0);
  return { files };
}

export function slug(id) {
  return id.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function partition(rules) {
  const groups = new Map();
  for (const rule of rules) {
    if (!groups.has(rule.group)) groups.set(rule.group, []);
    groups.get(rule.group).push(rule);
  }
  return [...groups].map(([group, members]) => ({ name: slug(group), group, rules: members }));
}

const KIND_OF_GROUP = new Map([['Reuse', 'reuse'], ['Dead Code', 'dead-code']]);

export function kindOf(group) {
  return KIND_OF_GROUP.has(group) ? KIND_OF_GROUP.get(group) : 'rules';
}

export function checkKinds(groups) {
  const absent = [...KIND_OF_GROUP.keys()].filter((group) => !groups.includes(group));
  if (absent.length > 0) throw new Error(`no rule is in the group ${absent.join(', ')}, which a kind of probe is tied to: the group was renamed or removed`);
}

const unique = (items) => [...new Set(items)];
function parents(children, entries, level) {
  return unique(children.map((child) => child.parent)).map((id) => {
    const parent = entries.find((entry) => entry.id === id);
    if (parent === undefined) throw new Error(`the ${level} ${id} is named as a parent and is not declared`);
    return parent;
  });
}

export function rulebook(rules, governance) {
  return { rules, principles: parents(rules, governance.principles, 'principle'), definitions: governance.definitions };
}

export const isText = (text) => !text.includes('\0');

const LOOKS_BEYOND_THE_CHANGE = ['reuse', 'dead-code'];

export function instructions(context, probes, handedRulesets) {
  const checkedOut = (kind) => (LOOKS_BEYOND_THE_CHANGE.includes(kind) ? { checkout: context.checkout } : {});
  const handed = [
    ...probes.map((probe) => ({ name: probe.name, kind: probe.kind, beyond: { rulebook: probe.rulebook, ...checkedOut(probe.kind) } })),
    { name: 'context', kind: 'context', beyond: { rulesets: handedRulesets } },
  ];
  return handed.map((probe, i) => {
    const name = `${String(i + 1).padStart(2, '0')}-${probe.name}`;
    return { name, document: { kind: probe.kind, review: { ...context.review, ledger: context.ledger(name), report: context.report(name) }, ...probe.beyond } };
  });
}

export function numbered(text) {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return Object.fromEntries(lines.map((line, i) => [i + 1, line]));
}

const inside = (ranges, line) => ranges.some((range) => range.start <= line && line <= range.end);

export function fragments(lines, added, removed) {
  const head = [];
  for (const [name, text] of Object.entries(lines)) {
    const number = Number(name);
    const kind = inside(added, number) ? 'surface' : 'context';
    const last = head.at(-1);
    if (last !== undefined && last.kind === kind) last.lines[number] = text;
    else head.push(kind === 'surface' ? { kind, side: 'head', lines: { [number]: text } } : { kind, lines: { [number]: text } });
  }
  const base = removed.map((hunk) => ({ kind: 'surface', side: 'base', lines: Object.fromEntries(hunk.content.split('\n').map((text, i) => [hunk.start + i, text])) }));
  return [...head, ...base];
}

export function removedLines(hunks, ranges) {
  return ranges.map((range) => {
    const hunk = hunks.find((candidate) => candidate.start <= range.start && range.end <= candidate.end);
    if (hunk === undefined) throw new Error(`no removed hunk holds lines ${range.start}-${range.end}`);
    return { ...range, content: hunk.content.split('\n').slice(range.start - hunk.start, range.end - hunk.start + 1).join('\n') };
  });
}

export function span(lines) {
  const numbers = Object.keys(lines).map(Number);
  return { start: Math.min(...numbers), end: Math.max(...numbers) };
}

export const FILE_LINES = 200;
export const FILE_TOO_LARGE = 'File too large';

const TEST_DIR = /(?:^|\/)(?:tests?|specs?|__tests__|[^/]*\.tests?)\//i;
const TEST_FILE = /(?:^|\/)(?:(?:test|spec)s?[._-].+|.+[._-](?:test|spec)s?|(?:test|spec)s?|[A-Za-z0-9]+Tests?)\.[^/]+$/;
export const isTest = (path) => TEST_DIR.test(path) || TEST_FILE.test(path);

export function tooLarge(counts) {
  return counts.filter((file) => !isTest(file.path) && file.lines > FILE_LINES).map((file) => `${file.path} is ${file.lines} lines long, which breaks ${FILE_TOO_LARGE}`);
}

export function merge(ledgers) {
  return { headCommit: ledgers[0].headCommit, rows: ledgers.flatMap((ledger) => ledger.rows) };
}

export function verdict(ledger) {
  return ledger.rows.some((row) => row.verdict === 'violation') ? 'request-changes' : 'approve';
}

export const CELL = 400;

function cell(text) {
  const flat = String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  return flat.length > CELL ? `${flat.slice(0, CELL - 1)}…` : flat;
}

export function table(ledger) {
  const rows = ledger.rows.map((row) => `| ${cell(ruleName(row))} | ${cell(row.examined.join('; '))} | ${row.verdict} | ${cell(row.evidence)} |`);
  return ['| rule | examined | verdict | evidence |', '|---|---|---|---|', ...rows].join('\n');
}

export const SITE = 'https://thruput.se/agents/';

export function citation(document, row) {
  if (row.bookRule !== undefined) return `[${row.bookRule.heading}](${row.bookRule.ruleset})`;
  const principle = document.rulebook.rules.find((rule) => rule.id === row.rule).parent;
  return `[${principle}](${SITE}#${slug(principle)})`;
}

const RENDERED = / breaks \[[^\]]+\]\([^)]+\)/;

export const ours = (text) => RENDERED.test(text) || text.includes(SITE);

export function message(violation, cite) {
  return `${violation.observation} breaks ${cite}`;
}

export function comment(finding) {
  const { anchor } = finding;
  if (anchor.kind === 'pull-request') return undefined;
  const side = HOST_SIDE_OF_SIDE[anchor.side];
  const { start, end } = anchor.lines;
  if (start === end) return { path: anchor.path, line: end, side, body: finding.body };
  return { path: anchor.path, start_line: start, start_side: side, line: end, side, body: finding.body };
}

export function alreadyOpen(violation, cite, threads) {
  const { anchor } = violation;
  if (anchor.kind === 'pull-request') return false;
  return threads.some((thread) => thread.path === anchor.path && thread.lines.end === span(anchor.lines).end && thread.body.includes(cite));
}

export function settled(entries, threads) {
  const carried = new Set();
  for (const { document, ledger } of entries) {
    for (const row of ledger.rows.filter((candidate) => candidate.verdict === 'violation')) {
      const cite = citation(document, row);
      for (const violation of row.violations) threads.filter((thread) => alreadyOpen(violation, cite, [thread])).forEach((thread) => carried.add(thread));
    }
  }
  return threads.filter((thread) => !carried.has(thread));
}

export function outcome(entries, threads) {
  const ledger = merge(entries.map((entry) => entry.ledger));
  const findings = entries.flatMap(({ document, ledger: own }) => own.rows.filter((row) => row.verdict === 'violation')
    .flatMap((row) => {
      const cite = citation(document, row);
      return row.violations.map((violation) => ({ ...violation, body: message(violation, cite), carried: alreadyOpen(violation, cite, threads) }));
    }));
  const fresh = findings.filter((finding) => !finding.carried);
  const inline = fresh.filter((finding) => finding.anchor.kind === 'surface')
    .map(({ anchor, body }) => ({ path: anchor.path, side: anchor.side, lines: span(anchor.lines), body }));
  const atPullRequest = fresh.filter((finding) => finding.anchor.kind === 'pull-request');
  const decided = verdict(ledger);
  const summary = [
    `**Verdict: ${decided}**`,
    `${ledger.rows.length} rules probed by ${entries.length} probes at ${ledger.headCommit} against [the rules](${SITE}): ${findings.length} violations, ${inline.length} inline, ${atPullRequest.length} at the pull request, ${findings.length - fresh.length} already carried by a thread.`,
    ...atPullRequest.map((finding) => finding.body),
  ].join('\n\n');
  const open = threads.filter((thread) => thread.state === 'open');
  const byAuthor = threads.filter((thread) => thread.state === 'resolved-by-author');
  return {
    headCommit: ledger.headCommit,
    verdict: decided,
    summary,
    inline,
    settle: settled(entries, open).map((thread) => thread.id),
    reopen: byAuthor.filter((thread) => settled(entries, [thread]).length === 0).map((thread) => thread.id),
  };
}
