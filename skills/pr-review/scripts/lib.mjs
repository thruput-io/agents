const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function pushAdded(ranges, line) {
  const last = ranges[ranges.length - 1];
  if (last && last.end === line - 1) {
    last.end = line;
    return;
  }
  ranges.push({ start: line, end: line });
}

function pushRemoved(ranges, line, text) {
  const last = ranges[ranges.length - 1];
  if (last && last.end === line - 1) {
    last.end = line;
    last.content = `${last.content}\n${text}`;
    return;
  }
  ranges.push({ start: line, end: line, content: text });
}

export function parseHunks(lines) {
  const file = { added: [], removed: [] };
  let oldLine = 0;
  let newLine = 0;
  for (const line of lines) {
    const hunk = HUNK.exec(line);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
    } else if (line.startsWith('+')) {
      pushAdded(file.added, newLine);
      newLine += 1;
    } else if (line.startsWith('-')) {
      pushRemoved(file.removed, oldLine, line.slice(1));
      oldLine += 1;
    } else if (line.startsWith(' ')) {
      oldLine += 1;
      newLine += 1;
    }
  }
  return file;
}

function pathOf(header) {
  const name = header.split('\t')[0];
  return name === '/dev/null' ? undefined : name.replace(/^[ab]\//, '');
}

export function parseDiff(text) {
  const sections = text.split(/^(?=diff --git )/m).filter((section) => section.startsWith('diff --git '));
  return sections.map((section) => {
    const lines = section.split('\n');
    const start = lines.findIndex((line) => HUNK.test(line));
    const header = start === -1 ? lines : lines.slice(0, start);
    const oldPath = pathOf(header.find((line) => line.startsWith('--- '))?.slice(4) ?? '/dev/null');
    const newPath = pathOf(header.find((line) => line.startsWith('+++ '))?.slice(4) ?? '/dev/null');
    const body = start === -1 ? [] : lines.slice(start);
    return { path: newPath ?? oldPath, ...parseHunks(body) };
  }).filter((file) => file.path !== undefined);
}

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

const CITATION = /\[\[([^\]]+)\]\]/g;

const unique = (items) => [...new Set(items)];
const texts = (value) => {
  if (typeof value === 'string') return [value];
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(texts);
  return [];
};
const named = (entry) => unique([
  ...texts(entry).flatMap((text) => [...text.matchAll(CITATION)].map((match) => match[1])),
  ...(entry.closedEnumerationOf ?? []),
  ...(entry.openEnumerationOf ?? []),
]);

function parents(children, entries, level) {
  return unique(children.map((child) => child.parent)).map((id) => {
    const parent = entries.find((entry) => entry.id === id);
    if (parent === undefined) throw new Error(`the ${level} ${id} is named as a parent and is not declared`);
    return parent;
  });
}

export function rulebook(rules, governance) {
  const principles = parents(rules, governance.principles, 'principle');
  const glossary = new Map(governance.definitions.map((definition) => [definition.id, definition]));
  const cited = new Set();
  const unread = [...rules, ...principles];
  while (unread.length > 0) {
    for (const id of named(unread.shift()).filter((candidate) => glossary.has(candidate) && !cited.has(candidate))) {
      cited.add(id);
      unread.push(glossary.get(id));
    }
  }
  return { rules, principles, definitions: governance.definitions.filter((definition) => cited.has(definition.id)) };
}

export const isText = (text) => !text.includes('\0');

export function rawUrl(canonicalUrl) {
  const file = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(canonicalUrl);
  if (file === null) throw new Error(`${canonicalUrl} is not a file on github.com`);
  return `https://raw.githubusercontent.com/${file[1]}/${file[2]}/${file[3]}`;
}

export function rulesets(index, texts) {
  return index.map((entry) => {
    if (!texts.has(entry.canonical_url)) throw new Error(`the ruleset ${entry.canonical_url} was not read`);
    return { url: entry.canonical_url, title: entry.title, focus: entry.focus, whenToUse: entry.when_to_use, text: texts.get(entry.canonical_url) };
  });
}

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

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function resolve(read, name, ref) {
  const [path, pointer = ''] = ref.split('#');
  const target = path === '' ? name : new URL(path, `file:///${name}`).pathname.slice(1);
  return { name: target, schema: pointer.split('/').filter(Boolean).reduce((node, key) => node[key], read(target)) };
}

function fixed(read, name, schema) {
  if (schema.$ref !== undefined) {
    const target = resolve(read, name, schema.$ref);
    return fixed(read, target.name, target.schema);
  }
  const own = Object.entries(schema.properties ?? {}).filter(([, property]) => 'const' in property).map(([property, { const: value }]) => [property, value]);
  const inherited = (schema.allOf ?? []).flatMap((branch) => fixed(read, name, branch));
  return [...inherited, ...own];
}

export function complete(read, name, document, schema = read(name)) {
  if (schema.$ref !== undefined) {
    const target = resolve(read, name, schema.$ref);
    return complete(read, target.name, document, target.schema);
  }
  if (Array.isArray(document)) return schema.items === undefined ? document : document.map((item) => complete(read, name, item, schema.items));
  if (typeof document !== 'object' || document === null) return document;
  let completed = document;
  if (schema.oneOf !== undefined) {
    const belongs = schema.oneOf.filter((branch) => fixed(read, name, branch).every(([property, value]) => !(property in document) || same(document[property], value)));
    if (belongs.length !== 1) throw new Error(`${name}: the document belongs to ${belongs.length} of the ${schema.oneOf.length} branches, so what its schema says cannot be told`);
    completed = complete(read, name, document, belongs[0]);
  }
  for (const branch of schema.allOf ?? []) {
    completed = complete(read, name, completed, branch);
  }
  const properties = schema.properties ?? {};
  const own = Object.entries(completed).map(([property, value]) => [property, property in properties ? complete(read, name, value, properties[property]) : value]);
  return Object.fromEntries([...fixed(read, name, schema), ...own]);
}

export const FILE_LINES = 200;
export const FILE_TOO_LARGE = 'File too large';

export function tooLarge(counts) {
  return counts.filter((file) => file.lines > FILE_LINES).map((file) => `${file.path} is ${file.lines} lines long, which breaks ${FILE_TOO_LARGE}`);
}

export const ESCALATION_ROWS = 3;

export function anchorInside(anchor, files) {
  if (anchor.kind === 'pull-request') return true;
  const file = files.find((candidate) => candidate.path === anchor.path);
  if (file === undefined) return false;
  const copied = Object.entries(anchor.lines);
  if (copied.length === 0) return false;
  return file.fragments.some((fragment) => fragment.kind === 'surface' && fragment.side === anchor.side
    && copied.every(([number, text]) => fragment.lines[number] === text));
}

const ruleName = (row) => (row.bookRule === undefined ? row.rule : row.bookRule.heading);

export function checkLedger(name, document, ledger) {
  const { headCommit, files } = document.review;
  if (ledger.headCommit !== headCommit) {
    throw new Error(`${name}: ledger is for ${ledger.headCommit}, the review is of ${headCommit}`);
  }
  if (document.kind === 'context') {
    if (ledger.rows.length !== ESCALATION_ROWS) throw new Error(`${name}: ${ledger.rows.length} rows, ${ESCALATION_ROWS} expected`);
    const ours = ledger.rows.filter((row) => row.bookRule === undefined).map((row) => row.rule);
    if (ours.length > 0) throw new Error(`${name}: ${JSON.stringify(ours)} is not a rule of the ruleset; the context probe writes its rows on book rules`);
    const handed = document.rulesets.map((ruleset) => ruleset.url);
    const selected = [...new Set(ledger.rows.map((row) => row.bookRule.ruleset))];
    const foreign = selected.filter((url) => !handed.includes(url));
    if (foreign.length > 0) throw new Error(`${name}: ${JSON.stringify(foreign)} is not a ruleset the probe was handed`);
    if (selected.length !== 1) throw new Error(`${name}: rows name ${selected.length} rulesets; the context probe selects one ruleset`);
  } else {
    const found = ledger.rows.map((row) => row.rule);
    const expected = document.rulebook.rules.map((rule) => rule.id);
    if (JSON.stringify(found) !== JSON.stringify(expected)) {
      const missing = expected.filter((id) => !found.includes(id));
      const extra = found.filter((id) => !expected.includes(id));
      throw new Error(`${name}: rows do not match the rules, in order. missing: ${JSON.stringify(missing)} extra: ${JSON.stringify(extra)} found: ${JSON.stringify(found)}`);
    }
  }
  for (const row of ledger.rows.filter((candidate) => candidate.verdict === 'violation')) {
    for (const violation of row.violations) {
      if (!anchorInside(violation.anchor, files)) {
        throw new Error(`${name}: a violation of ${ruleName(row)} is anchored outside the surface at ${JSON.stringify(violation.anchor)}; a finding with no surface line to blame is anchored at the pull request`);
      }
    }
  }
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
