import type { z } from "zod";
import {
	type Anchor,
	type Ledger,
	LedgerSchema,
	type Row,
	type Rule,
	type RuleHeading,
	type RulesetUrl,
	type Surface,
	type SurfaceAnchor,
	type SurfaceFile,
} from "./contracts.g.ts";
import { isNullOrEmpty } from "./nullish.ts";

const ESCALATION_ROWS = 3;

interface RuleIdReference {
	readonly id: Rule["id"];
}

export interface RulesProbe {
	readonly surface: Surface;
	readonly rulebook: { readonly rules: readonly RuleIdReference[] };
}

export interface ContextProbe {
	readonly surface: Surface;
	readonly rulesets: readonly { readonly url: RulesetUrl }[];
}

export type LedgerProbe = RulesProbe | ContextProbe;

export const ruleName = (row: Row): RuleHeading | Rule["id"] =>
	"bookRule" in row ? row.bookRule.heading : row.rule;

const surfaceAnchorInside = (
	anchor: SurfaceAnchor,
	files: readonly SurfaceFile[],
): boolean => {
	const matchedFile = files.find((candidate) => candidate.path === anchor.path);
	const copied = Object.entries(anchor.lines);
	return (
		!isNullOrEmpty(matchedFile) &&
		copied.length > 0 &&
		matchedFile.fragments.some(
			(fragment) =>
				fragment.kind === "surface" &&
				fragment.side === anchor.side &&
				copied.every(
					([numberText, lineText]) => fragment.lines[numberText] === lineText,
				),
		)
	);
};

export const anchorInside = (
	anchor: Anchor,
	files: readonly SurfaceFile[],
): boolean =>
	anchor.kind === "pull-request" || surfaceAnchorInside(anchor, files);

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
	const ourRules = ledger.rows.flatMap((row) =>
		"rule" in row ? [row.rule] : [],
	);
	if (ourRules.length > 0) {
		return issue(
			ctx,
			`${JSON.stringify(ourRules)} is not a rule of the ruleset; the context probe writes its rows on book rules`,
		);
	}
	const handed = probe.rulesets.map((ruleset) => ruleset.url);
	const selected = [
		...new Set(
			ledger.rows.flatMap((row) =>
				"bookRule" in row ? [row.bookRule.ruleset] : [],
			),
		),
	];
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
	const found = ledger.rows.map((row) => ("rule" in row ? row.rule : null));
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
	for (const row of ledger.rows) {
		if (row.verdict !== "violation") {
			continue;
		}
		const outside = row.violations.find(
			(violation) => !anchorInside(violation.anchor, probe.surface.files),
		);
		if (!isNullOrEmpty(outside)) {
			issue(
				ctx,
				`a violation of ${ruleName(row)} is anchored outside the surface at ${JSON.stringify(outside.anchor)}; a finding with no surface line to blame is anchored at the pull request`,
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
		const rowsValid =
			"rulesets" in probe
				? refineContext(probe, ledger, ctx)
				: refineRules(probe, ledger, ctx);
		if (rowsValid) {
			refineViolations(probe, ledger, ctx);
		}
	});
