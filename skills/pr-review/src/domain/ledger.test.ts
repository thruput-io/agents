import assert from "node:assert/strict";
import { test as it } from "node:test";
import { z } from "zod";
import type { Row, RuleRef, Violation } from "./contracts.g.ts";
import { type LedgerProbe, ledgerFor, type RulesProbe } from "./ledger.ts";

const MISSING_B_RE = /missing: \["B"\]/u;
const EXTRA_Z_RE = /extra: \["Z"\]/u;
const IN_ORDER_RE = /in order/u;
const FOREIGN_COMMIT_RE = /ledger is for b{40}/u;
const OUTSIDE_SURFACE_RE = /violation of A is anchored outside the surface/u;

const rejectionMessage = (
	targetProbe: LedgerProbe,
	raw: { readonly headCommit: string; readonly rows: readonly Row[] },
): string => {
	const parsed = ledgerFor(targetProbe).safeDecode({
		headCommit: raw.headCommit,
		rows: [...raw.rows],
	});
	if (parsed.success) {
		throw new Error("Expected ledger validation to reject");
	}
	return z.prettifyError(parsed.error);
};

const SHA1_HEX_LENGTH = 40;
const H = "a".repeat(SHA1_HEX_LENGTH);
const OTHER = "b".repeat(SHA1_HEX_LENGTH);
const SURFACE_END = 5;
const CONTEXT_START = 6;
const CONTEXT_END = 8;
const OUTSIDE_LINE = 7;
const SURFACE_TAIL = 9;
const text = (n: number) => `L${n}`;
const run = (from: number, to: number) =>
	Array.from({ length: to - from + 1 }, (_, i) => ({
		idToReportViolationOn: `p:${from + i}`,
		text: text(from + i),
	}));
const contextRun = (from: number, to: number) =>
	Array.from({ length: to - from + 1 }, (_, i) => text(from + i));
const files = [
	{
		path: "p",
		fragments: [
			{
				kind: "surface" as const,
				side: "head" as const,
				lines: run(1, SURFACE_END),
			},
			{
				kind: "context" as const,
				lines: contextRun(CONTEXT_START, CONTEXT_END),
			},
			{
				kind: "surface" as const,
				side: "head" as const,
				lines: run(SURFACE_TAIL, SURFACE_TAIL),
			},
		],
	},
];
const probe: RulesProbe = {
	surface: { headCommit: H, files },
	rulebook: { rules: [{ id: "A" }, { id: "B" }] },
};

const violation = (rule: RuleRef): Violation => ({
	rule,
	observation: "what is wrong",
});
const violationAt = (rule: RuleRef, line: number): Violation => ({
	rule,
	idToReportViolationOn: `p:${line}`,
	observation: "what is wrong",
});
const cleanRow = (rule: string): Row => ({
	rule,
	examined: ["x"],
	verdict: "clean",
	evidence: "e",
});
const violatedRow = (rule: string, violations: Violation[]): Row => ({
	rule,
	examined: ["x"],
	verdict: "violation",
	evidence: "e",
	violations,
});
const cleanBookRow = (heading: string): Row => ({
	bookRule: { ruleset: "https://books.example/ddd.md", heading },
	examined: ["x"],
	verdict: "clean",
	evidence: "e",
});

it("the ledger schema accepts rows matching the rules in order", () => {
	const parsed = ledgerFor(probe).decode({
		headCommit: H,
		rows: [cleanRow("A"), cleanRow("B")],
	});
	assert.equal(parsed.headCommit, H);
	assert.equal(parsed.rows.length, 2);
});

it("the ledger schema rejects a missing, extra, reordered, book-rule, or foreign-commit ledger", () => {
	assert.match(
		rejectionMessage(probe, { headCommit: H, rows: [cleanRow("A")] }),
		MISSING_B_RE,
	);
	assert.match(
		rejectionMessage(probe, {
			headCommit: H,
			rows: [cleanRow("A"), cleanRow("B"), cleanRow("Z")],
		}),
		EXTRA_Z_RE,
	);
	assert.match(
		rejectionMessage(probe, {
			headCommit: H,
			rows: [cleanRow("B"), cleanRow("A")],
		}),
		IN_ORDER_RE,
	);
	assert.match(
		rejectionMessage(probe, {
			headCommit: H,
			rows: [cleanRow("A"), cleanBookRow("x")],
		}),
		MISSING_B_RE,
	);
	assert.match(
		rejectionMessage(probe, {
			headCommit: OTHER,
			rows: [cleanRow("A"), cleanRow("B")],
		}),
		FOREIGN_COMMIT_RE,
	);
});

it("the ledger schema rejects a violation anchored outside the surface", () => {
	const rows = (v: Violation) => [violatedRow("A", [v]), cleanRow("B")];
	assert.equal(
		ledgerFor(probe).decode({
			headCommit: H,
			rows: rows(violationAt("A", 2)),
		}).rows.length,
		2,
	);
	assert.equal(
		ledgerFor(probe).decode({ headCommit: H, rows: rows(violation("A")) }).rows
			.length,
		2,
	);
	assert.match(
		rejectionMessage(probe, {
			headCommit: H,
			rows: rows(violationAt("A", OUTSIDE_LINE)),
		}),
		OUTSIDE_SURFACE_RE,
	);
});
