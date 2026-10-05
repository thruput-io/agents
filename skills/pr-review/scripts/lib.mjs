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

const SIDE_OF_HOST_SIDE = { RIGHT: 'head', LEFT: 'base' };
const HOST_SIDE_OF_SIDE = { head: 'RIGHT', base: 'LEFT' };

export function threadRanges(threads, author) {
  const relevant = threads.filter((thread) => thread.line !== null
    && (!thread.isResolved || thread.resolvedBy?.login === author));
  const sides = { head: new Map(), base: new Map() };
  for (const thread of relevant) {
    const side = sides[SIDE_OF_HOST_SIDE[thread.diffSide]];
    const ranges = side.get(thread.path) ?? [];
    side.set(thread.path, union(ranges, [{ start: thread.startLine ?? thread.line, end: thread.line }]));
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

const KIND_OF_GROUP = new Map([['Development Stack', 'reuse-ladder'], ['Dead Code & Comments', 'dead-code']]);

export function kindOf(group) {
  return KIND_OF_GROUP.has(group) ? KIND_OF_GROUP.get(group) : 'rules';
}

export function checkKinds(groups) {
  const absent = [...KIND_OF_GROUP.keys()].filter((group) => !groups.includes(group));
  if (absent.length > 0) throw new Error(`no rule is in the group ${absent.join(', ')}, which a kind of probe is tied to: the group was renamed or removed`);
}

const DEFINITION = /\b(?:function|def|class|interface|type|enum|struct|fn|func|module|namespace|trait|record|const|let|var|val|protocol|extension)\s+([A-Za-z_$][\w$]*)/g;
const SHELL_FUNCTION = /^\s*([A-Za-z_]\w*)\s*\(\)\s*\{/;
const ID = /^\s*-?\s*id:\s*(\S.*?)\s*$/;
const IDENTIFIER = /[A-Za-z_$][\w$]{2,}/g;
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

export function definedOn(line) {
  const names = [];
  for (const match of line.matchAll(DEFINITION)) names.push(match[1]);
  const shell = SHELL_FUNCTION.exec(line);
  if (shell) names.push(shell[1]);
  const id = ID.exec(line);
  if (id) names.push(id[1].replace(/^["']|["']$/g, ''));
  return names;
}

const changedLines = (diff, sign) => diff.split('\n').filter((raw) => raw.startsWith(sign) && !/^[+-]{3} /.test(raw)).map((raw) => raw.slice(1));

export function definitions(diff) {
  return { added: unique(changedLines(diff, '+').flatMap(definedOn)), removed: unique(changedLines(diff, '-').flatMap(definedOn)) };
}

export function referencedOn(diff, sign) {
  return unique(changedLines(diff, sign).flatMap((line) => [...line.matchAll(IDENTIFIER)].map((m) => m[0]).concat([...line.matchAll(CITATION)].map((m) => m[1]))));
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const basename = (path) => path.slice(path.lastIndexOf('/') + 1);
const mentions = (text, path) => text.includes(path) || new RegExp(`(^|[^\\w/.-])${escape(basename(path))}(?![\\w.-])`).test(text);
const word = (name) => new RegExp(`(^|[^\\w$])${escape(name)}(?![\\w$])`);
export const isText = (text) => !text.includes('\0');

export function callSites(changed, names, paths, read) {
  const changedSet = new Set(changed);
  const others = paths.filter((path) => !changedSet.has(path));
  const words = names.map(word);
  const into = others.filter((path) => {
    const text = read(path);
    return isText(text) && (words.some((w) => w.test(text)) || changed.some((file) => mentions(text, file)));
  });
  const outOf = new Set();
  for (const file of changed.filter((path) => paths.includes(path))) {
    const text = read(file);
    if (!isText(text)) continue;
    for (const path of others) if (mentions(text, path)) outOf.add(path);
  }
  return { into, outOf: [...outOf] };
}

export function definitionIndex(paths, read) {
  const index = new Map();
  for (const path of paths) {
    const text = read(path);
    if (!isText(text)) continue;
    for (const name of unique(text.split('\n').flatMap(definedOn))) {
      if (!index.has(name)) index.set(name, []);
      index.get(name).push(path);
    }
  }
  return index;
}

export function deadCode(diff, paths, read) {
  const textFiles = paths.filter((path) => isText(read(path)));
  const index = definitionIndex(textFiles, read);
  const mentioned = (name) => textFiles.filter((path) => word(name).test(read(path)));
  const defined = (name) => index.get(name) ?? [];
  const outside = (name) => mentioned(name).filter((path) => !defined(name).includes(path));
  const { added, removed } = definitions(diff);
  return {
    unusedDefinitions: added.filter((name) => outside(name).length === 0).map((name) => ({ name, definedIn: defined(name) })),
    danglingReferences: removed.filter((name) => !index.has(name)).map((name) => ({ name, usedIn: mentioned(name) })).filter((entry) => entry.usedIn.length > 0),
    orphanedDefinitions: referencedOn(diff, '-').filter((name) => index.has(name) && !removed.includes(name) && outside(name).length === 0)
      .map((name) => ({ name, definedIn: defined(name) })),
  };
}

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

export function instructions(context, probes, handedRulesets) {
  const handed = [
    ...probes.map((probe) => ({ name: probe.name, kind: probe.kind, beyond: { rulebook: probe.rulebook, ...context.beyond[probe.kind] } })),
    { name: 'escalation', kind: 'escalation', beyond: { rulesets: handedRulesets } },
  ];
  return handed.map((probe, i) => {
    const name = `${String(i + 1).padStart(2, '0')}-${probe.name}`;
    return { name, document: { kind: probe.kind, review: { ...context.review, ledger: context.ledger(name) }, ...probe.beyond } };
  });
}

export const ESCALATION_ROWS = 3;

const within = (ranges, start, end) => start <= end && ranges.some((range) => range.start <= start && end <= range.end);

export function anchorInside(anchor, surface) {
  if (anchor.kind === 'pull-request') return true;
  const file = surface.files.find((candidate) => candidate.path === anchor.path);
  if (file === undefined) return false;
  const ranges = { head: file.added, base: file.removed };
  return within(ranges[anchor.side], anchor.lines.start, anchor.lines.end);
}

const ruleName = (row) => (row.bookRule === undefined ? row.rule : row.bookRule.heading);

export function checkLedger(name, document, ledger) {
  const { changeSet, surface } = document.review;
  if (ledger.headCommit !== changeSet.headCommit) {
    throw new Error(`${name}: ledger is for ${ledger.headCommit}, the review is of ${changeSet.headCommit}`);
  }
  if (document.kind === 'escalation') {
    if (ledger.rows.length !== ESCALATION_ROWS) throw new Error(`${name}: ${ledger.rows.length} rows, ${ESCALATION_ROWS} expected`);
    const ours = ledger.rows.filter((row) => row.bookRule === undefined).map((row) => row.rule);
    if (ours.length > 0) throw new Error(`${name}: ${JSON.stringify(ours)} is not a rule of the ruleset; the escalation probe writes its rows on book rules`);
    const handed = document.rulesets.map((ruleset) => ruleset.url);
    const selected = [...new Set(ledger.rows.map((row) => row.bookRule.ruleset))];
    const foreign = selected.filter((url) => !handed.includes(url));
    if (foreign.length > 0) throw new Error(`${name}: ${JSON.stringify(foreign)} is not a ruleset the probe was handed`);
    if (selected.length !== 1) throw new Error(`${name}: rows name ${selected.length} rulesets; the escalation probe selects one ruleset`);
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
      if (!anchorInside(violation.anchor, surface)) {
        throw new Error(`${name}: a violation of ${ruleName(row)} is anchored outside the surface at ${JSON.stringify(violation.anchor)}; a finding with no surface line to blame is anchored at the pull request`);
      }
    }
  }
}

export function merge(ledgers) {
  return { headCommit: ledgers[0].headCommit, rows: ledgers.flatMap((ledger) => ledger.rows) };
}

export function verdict(ledger) {
  return ledger.rows.some((row) => row.verdict === 'violation') ? 'REQUEST_CHANGES' : 'APPROVE';
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
  return threads.some((thread) => thread.path === anchor.path && thread.line === anchor.lines.end && thread.body.includes(cite));
}

export function review(entries, { self, threads }) {
  const ledger = merge(entries.map((entry) => entry.ledger));
  const findings = entries.flatMap(({ document, ledger: own }) => own.rows.filter((row) => row.verdict === 'violation')
    .flatMap((row) => {
      const cite = citation(document, row);
      return row.violations.map((violation) => ({ ...violation, body: message(violation, cite), open: alreadyOpen(violation, cite, threads) }));
    }));
  const fresh = findings.filter((finding) => !finding.open);
  const comments = fresh.map(comment).filter((item) => item !== undefined);
  const atPullRequest = fresh.filter((finding) => finding.anchor.kind === 'pull-request');
  const decided = verdict(ledger);
  const event = self ? 'COMMENT' : decided;
  const body = [
    `**Verdict: ${decided}**${self ? ' (posted as a comment: the reviewer is the author)' : ''}`,
    `${ledger.rows.length} rules probed by ${entries.length} probes at ${ledger.headCommit}: ${findings.length} violations, ${comments.length} inline, ${atPullRequest.length} at the pull request, ${findings.length - fresh.length} already carried by an open thread.`,
    ...atPullRequest.map((finding) => finding.body),
    `<details>\n<summary>Review ledger</summary>\n\n${table(ledger)}\n\n</details>`,
  ].join('\n\n');
  return { commit_id: ledger.headCommit, event, body, comments };
}
