import { anchorInside, span } from './surface.mjs';

export function slug(id) {
  return id.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const ESCALATION_ROWS = 3;
const ruleName = (row) => (row.bookRule === undefined ? row.rule : row.bookRule.heading);

export function checkLedger(name, document, ledger) {
  const { headCommit, files } = document.review;
  if (ledger.headCommit !== headCommit) {
    throw new Error(`${name}: ledger is for ${ledger.headCommit}, the review is of ${headCommit}`);
  }
  if (document.kind === 'context') {
    if (ledger.rows.length !== ESCALATION_ROWS) throw new Error(`${name}: ${ledger.rows.length} rows, ${ESCALATION_ROWS} expected`);
    const ownRules = ledger.rows.filter((row) => row.bookRule === undefined).map((row) => row.rule);
    if (ownRules.length > 0) throw new Error(`${name}: ${JSON.stringify(ownRules)} is not a rule of the ruleset; the context probe writes its rows on book rules`);
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
export const message = (violation, cite) => `${violation.observation} breaks ${cite}`;

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
