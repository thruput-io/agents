import { z } from 'zod';
import { DEFS, SCHEMAS } from './contracts.mjs';
import { CommitSha, NonEmptyText, RulesetUrl } from './primitives.mjs';
import { Result } from './result.mjs';
import { Violation } from './violation.mjs';

const rowSchema = z.fromJSONSchema(DEFS['ledger.schema.json#/$defs/Row']);
const ledgerSchema = z.fromJSONSchema(SCHEMAS['ledger.schema.json']);
const rowToken = Symbol('Row');
const ledgerToken = Symbol('Ledger');
export const ESCALATION_ROWS = 3;
const CELL_MAX_LENGTH = 400;

function formatCell(text) {
  const flat = String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  return flat.length > CELL_MAX_LENGTH ? `${flat.slice(0, CELL_MAX_LENGTH - 1)}…` : flat;
}

function parseRuleTarget(v) {
  if ('bookRule' in v && v.bookRule !== undefined) {
    return RulesetUrl.fromRaw(v.bookRule.ruleset).flatMap((ruleset) =>
      NonEmptyText.fromRaw(v.bookRule.heading).map((heading) => ({
        rule: null,
        bookRule: Object.freeze({ ruleset, heading }),
      })),
    );
  }
  return NonEmptyText.fromRaw(v.rule).map((rule) => ({ rule, bookRule: null }));
}

function verifyContextRows(probeName, rows, instructions) {
  if (rows.length !== ESCALATION_ROWS) {
    return Result.err(`${probeName}: ${rows.length} rows, ${ESCALATION_ROWS} expected`);
  }
  const ours = rows.filter((r) => !r.isBookRule()).map((r) => r.ruleName());
  if (ours.length > 0) {
    return Result.err(`${probeName}: ${JSON.stringify(ours)} is not a rule of the ruleset; the context probe writes its rows on book rules`);
  }
  const handed = instructions.rulesets().map((rs) => rs.url().toContract());
  const selected = [...new Set(rows.map((r) => r.bookRule().ruleset.toContract()))];
  const foreign = selected.filter((url) => !handed.includes(url));
  if (foreign.length > 0) {
    return Result.err(`${probeName}: ${JSON.stringify(foreign)} is not a ruleset the probe was handed`);
  }
  if (selected.length !== 1) {
    return Result.err(`${probeName}: rows name ${selected.length} rulesets; the context probe selects one ruleset`);
  }
  return Result.ok(true);
}

function verifyRulebookRows(probeName, rows, instructions) {
  const found = rows.map((r) => (r.isBookRule() ? undefined : r.ruleName()));
  const expected = instructions.rulebook().ruleIds();
  if (JSON.stringify(found) !== JSON.stringify(expected)) {
    const missing = expected.filter((id) => !found.includes(id));
    const extra = found.filter((id) => !expected.includes(id));
    return Result.err(`${probeName}: rows do not match the rules, in order. missing: ${JSON.stringify(missing)} extra: ${JSON.stringify(extra)} found: ${JSON.stringify(found)}`);
  }
  return Result.ok(true);
}

export class Row {
  #rule;
  #bookRule;
  #examined;
  #verdict;
  #evidence;
  #violations;
  constructor(guard, rule, bookRule, examined, verdict, evidence, violations) {
    if (guard !== rowToken) throw new Error('Use Row.fromRaw to construct Row');
    this.#rule = rule;
    this.#bookRule = bookRule;
    this.#examined = Object.freeze([...examined]);
    this.#verdict = verdict;
    this.#evidence = evidence;
    this.#violations = Object.freeze([...violations]);
    Object.freeze(this);
  }
  static fromRaw(raw) {
    return Result.fromZod(rowSchema, raw, (v) => v).flatMap((v) =>
      parseRuleTarget(v).flatMap(({ rule, bookRule }) =>
        Result.collect(v.examined.map((e) => NonEmptyText.fromRaw(e))).flatMap((examined) =>
          NonEmptyText.fromRaw(v.evidence).flatMap((evidence) => {
            const rawViolations = v.verdict === 'violation' ? v.violations : [];
            return Result.collect(rawViolations.map((viol) => Violation.fromRaw(viol))).map(
              (violations) => new Row(rowToken, rule, bookRule, examined, v.verdict, evidence, violations),
            );
          }),
        ),
      ),
    );
  }
  isBookRule() { return this.#bookRule !== null; }
  bookRule() { return this.#bookRule; }
  ruleName() { return this.#bookRule !== null ? this.#bookRule.heading.toContract() : this.#rule.toContract(); }
  examined() { return this.#examined; }
  verdict() { return this.#verdict; }
  isViolation() { return this.#verdict === 'violation'; }
  evidence() { return this.#evidence; }
  violations() { return this.#violations; }
  citation(instructions) {
    if (this.#bookRule !== null) {
      return Result.ok(`[${this.#bookRule.heading.toContract()}](${this.#bookRule.ruleset.toContract()})`);
    }
    return instructions.rulebook().principleCitationForRule(this.#rule.toContract());
  }
  toContract() {
    const target = this.#bookRule !== null
      ? { bookRule: { ruleset: this.#bookRule.ruleset.toContract(), heading: this.#bookRule.heading.toContract() } }
      : { rule: this.#rule.toContract() };
    return {
      ...target,
      examined: this.#examined.map((e) => e.toContract()),
      verdict: this.#verdict,
      evidence: this.#evidence.toContract(),
      ...(this.#verdict === 'violation' ? { violations: this.#violations.map((v) => v.toContract()) } : {}),
    };
  }
}

export class Ledger {
  #headCommit;
  #rows;
  constructor(guard, headCommit, rows) {
    if (guard !== ledgerToken) throw new Error('Use Ledger.fromRaw to construct Ledger');
    this.#headCommit = headCommit;
    this.#rows = Object.freeze([...rows]);
    Object.freeze(this);
  }
  static fromRaw(raw) {
    return Result.fromZod(ledgerSchema, raw, (v) => v).flatMap((v) =>
      CommitSha.fromRaw(v.headCommit).flatMap((headCommit) =>
        Result.collect(v.rows.map((r) => Row.fromRaw(r))).map(
          (rows) => new Ledger(ledgerToken, headCommit, rows),
        ),
      ),
    );
  }
  static mergeAll(ledgers) {
    if (!Array.isArray(ledgers) || ledgers.length === 0) {
      return Result.err('Ledger.mergeAll: requires at least one Ledger');
    }
    return Ledger.fromRaw({
      headCommit: ledgers[0].headCommit().toContract(),
      rows: ledgers.flatMap((l) => l.rows().map((r) => r.toContract())),
    });
  }
  headCommit() { return this.#headCommit; }
  rows() { return this.#rows; }
  withRecordedRow(row) {
    return Ledger.fromRaw({
      headCommit: this.#headCommit.toContract(),
      rows: [...this.#rows.map((r) => r.toContract()), row.toContract()],
    });
  }
  verdict() { return this.#rows.some((r) => r.isViolation()) ? 'request-changes' : 'approve'; }
  verifyAgainstInstructions(probeName, instructions) {
    const expectedCommit = instructions.review().headCommit();
    if (!this.#headCommit.equals(expectedCommit)) {
      return Result.err(`${probeName}: ledger is for ${this.#headCommit.toContract()}, the review is of ${expectedCommit.toContract()}`);
    }
    const checkRows = instructions.kind() === 'context'
      ? verifyContextRows(probeName, this.#rows, instructions)
      : verifyRulebookRows(probeName, this.#rows, instructions);
    return checkRows.flatMap(() => {
      const outsideFinding = this.#rows
        .filter((r) => r.isViolation())
        .flatMap((r) => r.violations().map((v) => ({ row: r, violation: v })))
        .find(({ violation }) => !violation.isInsideReview(instructions.review()));
      if (outsideFinding !== undefined) {
        return Result.err(`${probeName}: a violation of ${outsideFinding.row.ruleName()} is anchored outside the surface at ${JSON.stringify(outsideFinding.violation.anchor().toContract())}; a finding with no surface line to blame is anchored at the pull request`);
      }
      return Result.ok(this);
    });
  }
  toMarkdownTable() {
    const lines = this.#rows.map(
      (r) => `| ${formatCell(r.ruleName())} | ${formatCell(r.examined().map((e) => e.toContract()).join('; '))} | ${r.verdict()} | ${formatCell(r.evidence().toContract())} |`,
    );
    return ['| rule | examined | verdict | evidence |', '|---|---|---|---|', ...lines].join('\n');
  }
  toContract() {
    return { headCommit: this.#headCommit.toContract(), rows: this.#rows.map((r) => r.toContract()) };
  }
}
