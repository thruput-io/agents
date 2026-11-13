import type {
	Evidence,
	Examined,
	Ledger,
	ReviewVerdict,
	Row,
	Rule,
	RuleHeading,
} from "./contracts.g.ts";
import { ruleName } from "./ledger.ts";
import { nonnull } from "./nullish.ts";

export const CELL = 400;
const PIPE_CHARACTER = /\|/gu;
const LINE_BREAK = /\r?\n/gu;

export const merge = (ledgers: readonly Ledger[]): Ledger => ({
	headCommit: nonnull(ledgers[0]).headCommit,
	rows: ledgers.flatMap((ledger) => ledger.rows),
});

export const verdict = (ledger: {
	readonly rows: readonly { readonly verdict: Row["verdict"] }[];
}): ReviewVerdict =>
	ledger.rows.some((row) => row.verdict === "violation")
		? "request-changes"
		: "approve";

const cell = (text: Evidence | Examined | RuleHeading | Rule["id"]): string => {
	const flat = text.replace(PIPE_CHARACTER, "\\|").replace(LINE_BREAK, " ");
	return flat.length > CELL ? `${flat.slice(0, CELL - 1)}…` : flat;
};

export function table(ledger: { readonly rows: readonly Row[] }): string {
	const rows = ledger.rows.map(
		(row) =>
			`| ${cell(ruleName(row))} | ${cell(row.examined.join("; "))} | ${row.verdict} | ${cell(row.evidence)} |`,
	);
	return [
		"| rule | examined | verdict | evidence |",
		"|---|---|---|---|",
		...rows,
	].join("\n");
}
