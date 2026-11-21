import assert from "node:assert/strict";
import { test as it } from "node:test";
import { z } from "zod";
import type { Row, RuleRef, Violation } from "./contracts.g.ts";
import { type ContextProbe, type LedgerProbe, ledgerFor } from "./ledger.ts";
import { resolveSurfaceLine, violationInside } from "./ledger-rows.ts";

const ONE_ROW_EXPECTED_THREE_RE = /1 rows, 3 expected/u;
const NOT_RULESET_RULE_RE = /\["A"\] is not a rule of the ruleset/u;
const NOT_HANDED_RULESET_RE =
	/other\.md"\] is not a ruleset the probe was handed/u;
const SELECTS_ONE_RULESET_RE = /selects one ruleset/u;

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
const LINE_3 = 3;
const SURFACE_END = 5;
const CONTEXT_START = 6;
const CONTEXT_END = 8;
const OUTSIDE_LINE = 7;
const SURFACE_TAIL = 9;
const EXPECTED_BOOK_ROWS = 3;
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
const contextProbe: ContextProbe = {
	surface: { headCommit: H, files },
	rulesets: [
		{ url: "https://books.example/ddd.md" },
		{ url: "https://books.example/clean-code.md" },
	],
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
const cleanBookRow = (heading: string): Row => ({
	bookRule: { ruleset: "https://books.example/ddd.md", heading },
	examined: ["x"],
	verdict: "clean",
	evidence: "e",
});
const rowOn = (ruleset: string): Row => ({
	bookRule: { ruleset, heading: "x" },
	examined: ["x"],
	verdict: "clean",
	evidence: "e",
});

it("violationInside accepts surface line ids and pull-request-level findings", () => {
	assert.equal(violationInside(violationAt("A", LINE_3), files), true);
	assert.equal(violationInside(violationAt("A", 1), files), true);
	assert.equal(violationInside(violationAt("A", SURFACE_TAIL), files), true);
	assert.equal(violationInside(violation("A"), files), true);
	assert.equal(violationInside(violationAt("A", CONTEXT_START), files), false);
	assert.equal(violationInside(violationAt("A", OUTSIDE_LINE), files), false);
});

it("resolveSurfaceLine maps '<path>:<line>' to the exact matching file, head side, and 1-based file line number", () => {
	const multiFileSurface = [
		{
			path: "helper.ts",
			fragments: [
				{
					kind: "surface" as const,
					side: "head" as const,
					lines: [
						{
							idToReportViolationOn: "helper.ts:1",
							text: "export const z = 3;",
						},
						{ idToReportViolationOn: "helper.ts:2", text: "" },
					],
				},
			],
		},
		{
			path: "service.ts",
			fragments: [
				{
					kind: "surface" as const,
					side: "head" as const,
					lines: [
						{
							idToReportViolationOn: "service.ts:2",
							text: "export const y = 2;",
						},
					],
				},
			],
		},
	];
	assert.deepEqual(resolveSurfaceLine("service.ts:2", multiFileSurface), {
		path: "service.ts",
		side: "head",
		line: 2,
	});
	assert.equal(resolveSurfaceLine("service.ts:99", multiFileSurface), null);
});

it("the ledger schema requires exactly three rows on rules of one ruleset the context probe was handed", () => {
	assert.equal(
		ledgerFor(contextProbe).decode({
			headCommit: H,
			rows: [cleanBookRow("x"), cleanBookRow("y"), cleanBookRow("z")],
		}).rows.length,
		EXPECTED_BOOK_ROWS,
	);
	assert.match(
		rejectionMessage(contextProbe, {
			headCommit: H,
			rows: [cleanBookRow("x")],
		}),
		ONE_ROW_EXPECTED_THREE_RE,
	);
	assert.match(
		rejectionMessage(contextProbe, {
			headCommit: H,
			rows: [cleanBookRow("x"), cleanBookRow("y"), cleanRow("A")],
		}),
		NOT_RULESET_RULE_RE,
	);
	assert.match(
		rejectionMessage(contextProbe, {
			headCommit: H,
			rows: [
				rowOn("https://books.example/other.md"),
				rowOn("https://books.example/other.md"),
				rowOn("https://books.example/other.md"),
			],
		}),
		NOT_HANDED_RULESET_RE,
	);
	assert.match(
		rejectionMessage(contextProbe, {
			headCommit: H,
			rows: [
				cleanBookRow("x"),
				cleanBookRow("y"),
				rowOn("https://books.example/clean-code.md"),
			],
		}),
		SELECTS_ONE_RULESET_RE,
	);
});
