const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function push(ranges, line) {
  const last = ranges[ranges.length - 1];
  if (last && last.end === line - 1) {
    last.end = line;
    return;
  }
  ranges.push({ start: line, end: line });
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
      push(file.added, newLine);
      newLine += 1;
    } else if (line.startsWith('-')) {
      push(file.removed, oldLine);
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

export function threadRanges(threads, author) {
  const relevant = threads.filter((thread) => thread.line !== null
    && (!thread.isResolved || thread.resolvedBy?.login === author));
  const sides = { RIGHT: new Map(), LEFT: new Map() };
  for (const thread of relevant) {
    const side = sides[thread.diffSide];
    const ranges = side.get(thread.path) ?? [];
    side.set(thread.path, union(ranges, [{ start: thread.startLine ?? thread.line, end: thread.line }]));
  }
  return sides;
}

export function narrowSurface(changeSet, changedSince, threads) {
  const files = changeSet.files.map((file) => ({
    path: file.path,
    added: intersect(file.added, union(changedSince.get(file.path) ?? [], threads.RIGHT.get(file.path) ?? [])),
    removed: intersect(file.removed, threads.LEFT.get(file.path) ?? []),
  })).filter((file) => file.added.length + file.removed.length > 0);
  return { headCommit: changeSet.headCommit, files };
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

export function instructions(context, probes, index) {
  const named = [
    ...probes.map((probe) => ({ name: probe.name, document: { group: probe.group, rules: probe.rules, ...context.probe } })),
    { name: 'escalation', document: { escalation: { index } } },
  ];
  return named.map((file, i) => {
    const name = `${String(i + 1).padStart(2, '0')}-${file.name}`;
    return { name, document: { ...file.document, ...context.shared, ledger: context.ledger(name) } };
  });
}

export const ESCALATION_ROWS = 3;

export function checkLedger(name, document, ledger) {
  if (ledger.headCommit !== document.changeSet.headCommit) {
    throw new Error(`${name}: ledger is for ${ledger.headCommit}, the review is of ${document.changeSet.headCommit}`);
  }
  const found = ledger.rows.map((row) => row.rule);
  if (document.escalation) {
    if (found.length !== ESCALATION_ROWS) throw new Error(`${name}: ${found.length} rows, ${ESCALATION_ROWS} expected`);
    return;
  }
  const expected = document.rules.map((rule) => rule.id);
  if (JSON.stringify(found) !== JSON.stringify(expected)) {
    const missing = expected.filter((id) => !found.includes(id));
    const extra = found.filter((id) => !expected.includes(id));
    throw new Error(`${name}: rows do not match the rules, in order. missing: ${JSON.stringify(missing)} extra: ${JSON.stringify(extra)} found: ${JSON.stringify(found)}`);
  }
}

export function merge(ledgers) {
  return { headCommit: ledgers[0].headCommit, rows: ledgers.flatMap((ledger) => ledger.rows) };
}

export function verdict(ledger) {
  return ledger.rows.some((row) => row.verdict === 'violation') ? 'REQUEST_CHANGES' : 'APPROVE';
}

function cell(text) {
  return String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function table(ledger) {
  const rows = ledger.rows.map((row) => `| ${cell(row.rule)} | ${cell(row.examined.join('; '))} | ${row.verdict} | ${cell(row.evidence)} |`);
  return ['| rule | examined | verdict | evidence |', '|---|---|---|---|', ...rows].join('\n');
}

export function comment(violation) {
  const { anchor } = violation;
  if (anchor.pullRequest) return undefined;
  if (anchor.lines) {
    return { path: anchor.path, start_line: anchor.lines.start, start_side: anchor.side, line: anchor.lines.end, side: anchor.side, body: violation.body };
  }
  return { path: anchor.path, line: anchor.line, side: anchor.side, body: violation.body };
}

export function review(ledger, probes) {
  const violations = ledger.rows.filter((row) => row.verdict === 'violation').flatMap((row) => row.violations);
  const comments = violations.map(comment).filter((item) => item !== undefined);
  const atPullRequest = violations.filter((violation) => violation.anchor.pullRequest);
  const event = verdict(ledger);
  const body = [
    `**Verdict: ${event}**`,
    `${ledger.rows.length} rules probed by ${probes} probes at ${ledger.headCommit}: ${violations.length} violations, ${comments.length} inline, ${atPullRequest.length} at the pull request.`,
    ...atPullRequest.map((violation) => violation.body),
    '<details>\n<summary>Review ledger</summary>\n\n' + table(ledger) + '\n\n</details>',
  ].join('\n\n');
  return { commit_id: ledger.headCommit, event, body, comments };
}
