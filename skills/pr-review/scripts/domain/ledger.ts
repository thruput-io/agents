import { LedgerSchema, type AgentInstructions, type Anchor, type Ledger, type Row } from './contracts.g.ts';

const ESCALATION_ROWS = 3;

type ReviewFile = AgentInstructions['review']['files'][number];
type RulesProbe = { review: { headCommit: string; files: ReviewFile[] }; rulebook: { rules: { id: string }[] } };
type ContextProbe = { review: { headCommit: string; files: ReviewFile[] }; rulesets: { url: string }[] };
export type LedgerProbe = RulesProbe | ContextProbe;

export const ruleName = (row: Row): string => ('bookRule' in row ? row.bookRule.heading : row.rule);

export function anchorInside(anchor: Anchor, files: ReviewFile[]): boolean {
  if (anchor.kind === 'pull-request') return true;
  const file = files.find((candidate) => candidate.path === anchor.path);
  if (file === undefined) return false;
  const copied = Object.entries(anchor.lines);
  if (copied.length === 0) return false;
  return file.fragments.some((fragment) => fragment.kind === 'surface' && fragment.side === anchor.side
    && copied.every(([number, text]) => fragment.lines[number] === text));
}

function contextProblem(probe: ContextProbe, ledger: Ledger): string | undefined {
  if (ledger.rows.length !== ESCALATION_ROWS) return `${ledger.rows.length} rows, ${ESCALATION_ROWS} expected`;
  const ours = ledger.rows.flatMap((row) => ('rule' in row ? [row.rule] : []));
  if (ours.length > 0) return `${JSON.stringify(ours)} is not a rule of the ruleset; the context probe writes its rows on book rules`;
  const handed = probe.rulesets.map((ruleset) => ruleset.url);
  const selected = [...new Set(ledger.rows.flatMap((row) => ('bookRule' in row ? [row.bookRule.ruleset] : [])))];
  const foreign = selected.filter((url) => !handed.includes(url));
  if (foreign.length > 0) return `${JSON.stringify(foreign)} is not a ruleset the probe was handed`;
  if (selected.length !== 1) return `rows name ${selected.length} rulesets; the context probe selects one ruleset`;
  return undefined;
}

function rulesProblem(probe: RulesProbe, ledger: Ledger): string | undefined {
  const found = ledger.rows.map((row) => ('rule' in row ? row.rule : undefined));
  const expected = probe.rulebook.rules.map((rule) => rule.id);
  if (JSON.stringify(found) === JSON.stringify(expected)) return undefined;
  const missing = expected.filter((id) => !found.includes(id));
  const extra = found.filter((id) => id === undefined || !expected.includes(id));
  return `rows do not match the rules, in order. missing: ${JSON.stringify(missing)} extra: ${JSON.stringify(extra)} found: ${JSON.stringify(found)}`;
}

function violationProblem(probe: LedgerProbe, ledger: Ledger): string | undefined {
  for (const row of ledger.rows) {
    if (row.verdict !== 'violation') continue;
    for (const violation of row.violations) {
      if (!anchorInside(violation.anchor, probe.review.files)) {
        return `a violation of ${ruleName(row)} is anchored outside the surface at ${JSON.stringify(violation.anchor)}; a finding with no surface line to blame is anchored at the pull request`;
      }
    }
  }
  return undefined;
}

function problemOf(probe: LedgerProbe, ledger: Ledger): string | undefined {
  if (ledger.headCommit !== probe.review.headCommit) return `ledger is for ${ledger.headCommit}, the review is of ${probe.review.headCommit}`;
  const rows = 'rulesets' in probe ? contextProblem(probe, ledger) : rulesProblem(probe, ledger);
  return rows ?? violationProblem(probe, ledger);
}

export function checkLedger(name: string, probe: LedgerProbe, raw: unknown): Ledger {
  const parsed = LedgerSchema.superRefine((ledger, ctx) => {
    const problem = problemOf(probe, ledger);
    if (problem !== undefined) ctx.addIssue({ code: 'custom', message: problem });
  }).safeParse(raw);
  if (parsed.success) return parsed.data;
  const [issue] = parsed.error.issues;
  const where = issue === undefined || issue.path.length === 0 ? '' : `${issue.path.join('.')}: `;
  throw new Error(`${name}: ${where}${issue?.message ?? 'invalid ledger'}`);
}
