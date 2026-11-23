import type { z } from "zod";
import {
	type Ledger,
	LedgerSchema,
	type Rule,
	type RulesetUrl,
	type Surface,
} from "./contracts.g.ts";
import { rowRuleRef, ruleName, violationInside } from "./ledger-rows.ts";
import { isNullOrEmpty } from "./nullish.ts";

const ESCALATION_ROWS = 3;

interface RuleIdReference {
	readonly id: Rule["id"];
}

interface RulesProbe {
	readonly surface: Surface;
	readonly rulebook: { readonly rules: readonly RuleIdReference[] };
}

interface ContextProbe {
	readonly surface: Surface;
	readonly rulesets: readonly { readonly url: RulesetUrl }[];
}

type LedgerProbe = RulesProbe | ContextProbe;

function issue(ctx: z.RefinementCtx, message: string): false {
	ctx.addIssue({ code: "custom", message });
	return false;
}

function refineContext(
	probe: ContextProbe,
	ledger: Ledger,
	ctx: z.RefinementCtx,
): boolean {
	if (ledger.rows.length !== ESCALATION_ROWS) {
		return issue(
			ctx,
			`${ledger.rows.length} rows, ${ESCALATION_ROWS} expected`,
		);
	}
	const ourRules: Rule["id"][] = [];
	const selectedSet = new Set<RulesetUrl>();
	for (const row of ledger.rows) {
		if ("bookRule" in row) {
			selectedSet.add(row.bookRule.ruleset);
		} else {
			ourRules.push(row.rule);
		}
	}
	if (ourRules.length > 0) {
		return issue(
			ctx,
			`${JSON.stringify(ourRules)} is not a rule of the ruleset; the context probe writes its rows on book rules`,
		);
	}
	const handed = probe.rulesets.map((ruleset) => ruleset.url);
	const selected = [...selectedSet];
	const foreign = selected.filter((url) => !handed.includes(url));
	if (foreign.length > 0) {
		return issue(
			ctx,
			`${JSON.stringify(foreign)} is not a ruleset the probe was handed`,
		);
	}
	const message = `rows name ${selected.length} rulesets; the context probe selects one ruleset`;
	return selected.length === 1 || issue(ctx, message);
}

function refineRules(
	probe: RulesProbe,
	ledger: Ledger,
	ctx: z.RefinementCtx,
): boolean {
	const found: (Rule["id"] | null)[] = [];
	for (const row of ledger.rows) {
		if ("rule" in row) {
			found.push(row.rule);
		} else {
			found.push(null);
		}
	}
	const expected = probe.rulebook.rules.map((rule) => rule.id);
	if (JSON.stringify(found) === JSON.stringify(expected)) {
		return true;
	}
	const missing = expected.filter((id) => !found.includes(id));
	const extra = found.filter(
		(id) => isNullOrEmpty(id) || !expected.includes(id),
	);
	return issue(
		ctx,
		`rows do not match the rules, in order. missing: ${JSON.stringify(missing)} extra: ${JSON.stringify(extra)} found: ${JSON.stringify(found)}`,
	);
}

function refineViolations(
	probe: LedgerProbe,
	ledger: Ledger,
	ctx: z.RefinementCtx,
): void {
	for (const row of ledger.rows.filter(
		(entry) => entry.verdict === "violation",
	)) {
		const expectedRule = JSON.stringify(rowRuleRef(row));
		const mismatchedRule = row.violations.find(
			(violation) => JSON.stringify(violation.rule) !== expectedRule,
		);
		if (!isNullOrEmpty(mismatchedRule)) {
			issue(
				ctx,
				`a violation in row ${ruleName(row)} names rule ${JSON.stringify(mismatchedRule.rule)} instead of ${expectedRule}`,
			);
			return;
		}
		const outside = row.violations.find(
			(violation) => !violationInside(violation, probe.surface.files),
		);
		if (!isNullOrEmpty(outside)) {
			issue(
				ctx,
				`a violation of ${ruleName(row)} is anchored outside the surface at ${JSON.stringify(outside.idToReportViolationOn)}; a finding with no surface line to blame omits idToReportViolationOn`,
			);
			return;
		}
	}
}

export const ledgerFor = (probe: LedgerProbe) =>
	LedgerSchema.superRefine((ledger, ctx) => {
		if (ledger.headCommit !== probe.surface.headCommit) {
			issue(
				ctx,
				`ledger is for ${ledger.headCommit}, the review is of ${probe.surface.headCommit}`,
			);
			return;
		}
		let rowsValid: boolean;
		if ("rulesets" in probe) {
			rowsValid = refineContext(probe, ledger, ctx);
		} else {
			rowsValid = refineRules(probe, ledger, ctx);
		}
		if (rowsValid) {
			refineViolations(probe, ledger, ctx);
		}
	});

export type { ContextProbe, LedgerProbe, RulesProbe };
