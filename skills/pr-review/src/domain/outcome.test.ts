import assert from "node:assert/strict";
import { test as it } from "node:test";
import type { Ledger, Row, RuleRef, Violation } from "./contracts.g.ts";
import { outcome } from "./outcome.ts";
import { SITE } from "./rulebook.ts";

const SHA1_HEX_LENGTH = 40;
const H = "a".repeat(SHA1_HEX_LENGTH);
const URL_DDD = "https://books.example/ddd.md";
const VERDICT_HEADER_RE = /^\*\*Verdict: request-changes\*\*\n/u;
const SUMMARY_COUNTS_RE =
	/3 rules probed by 2 probes at a{40} against \[the rules\]\(https:\/\/thruput\.se\/agents\/\): 3 violations, 0 inline, 1 at the pull request, 2 already carried by a thread/u;
const files = [
	{
		path: "p",
		fragments: [
			{
				kind: "surface" as const,
				side: "head" as const,
				lines: [
					{ idToReportViolationOn: "p:3", text: "x3" },
					{ idToReportViolationOn: "p:4", text: "x4" },
					{ idToReportViolationOn: "p:7", text: "x7" },
					{ idToReportViolationOn: "p:9", text: "y9" },
				],
			},
		],
	},
];
const contextProbe = {
	review: { headCommit: H, files },
	rulesets: [{ url: URL_DDD }],
};
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
const violation = (rule: RuleRef): Violation => ({
	rule,
	observation: "what is wrong",
});
const violationAt = (
	rule: RuleRef,
	idToReportViolationOn: string,
): Violation => ({
	rule,
	idToReportViolationOn,
	observation: "what is wrong",
});
const citeP = `[P](${SITE}#p)`;
const outcomeProbe = {
	review: { headCommit: H, files },
	rulebook: {
		rules: [
			{ id: "A", parent: "P" },
			{ id: "B", parent: "Q" },
		],
	},
};
const BOOK_RULE = { ruleset: URL_DDD, heading: "Book rule" };
const contextLedger: Ledger = {
	headCommit: H,
	rows: [
		{
			bookRule: BOOK_RULE,
			examined: ["x"],
			verdict: "violation",
			evidence: "e",
			violations: [violationAt(BOOK_RULE, "p:9")],
		},
	],
};
const sampleLedger: Ledger = {
	headCommit: H,
	rows: [
		violatedRow("A", [violationAt("A", "p:3"), violation("A")]),
		cleanRow("B"),
	],
};
const entries = [
	{ document: outcomeProbe, ledger: sampleLedger },
	{ document: contextProbe, ledger: contextLedger },
];

it("outcome produces the verdict, summary, fresh inline findings, threads to settle, and threads to reopen", () => {
	const open = {
		id: "o",
		path: "p",
		side: "head" as const,
		lines: { start: 3, end: 3 },
		state: "open" as const,
		body: `earlier breaks ${citeP}`,
	};
	const gone = {
		id: "g",
		path: "p",
		side: "head" as const,
		lines: { start: 7, end: 7 },
		state: "open" as const,
		body: `earlier breaks ${citeP}`,
	};
	const resolved = {
		id: "r",
		path: "p",
		side: "head" as const,
		lines: { start: 9, end: 9 },
		state: "resolved-by-author" as const,
		body: "earlier breaks [Book rule](https://books.example/ddd.md)",
	};
	const result = outcome(entries, [open, gone, resolved]);
	assert.equal(result.headCommit, H);
	assert.equal(result.verdict, "request-changes");
	assert.match(result.summary, VERDICT_HEADER_RE);
	assert.match(result.summary, SUMMARY_COUNTS_RE);
	assert.equal(
		result.summary.includes(`\n\nwhat is wrong breaks ${citeP}`),
		true,
	);
	assert.deepEqual(result.inline, []);
	assert.deepEqual(result.settle, ["g"]);
	assert.deepEqual(result.reopen, ["r"]);
});

it("outcome re-flags violations on resolved threads and approves clean ledgers", () => {
	const settledByReviewer = {
		id: "s",
		path: "p",
		side: "head" as const,
		lines: { start: 3, end: 3 },
		state: "resolved" as const,
		body: `earlier breaks ${citeP}`,
	};
	const withResolvedThread = outcome(entries, [settledByReviewer]);
	assert.deepEqual(withResolvedThread.inline, [
		{
			path: "p",
			side: "head",
			lines: { start: 3, end: 3 },
			body: `what is wrong breaks ${citeP}`,
		},
		{
			path: "p",
			side: "head",
			lines: { start: 9, end: 9 },
			body: "what is wrong breaks [Book rule](https://books.example/ddd.md)",
		},
	]);
	assert.equal(
		outcome(
			[
				{
					document: outcomeProbe,
					ledger: { headCommit: H, rows: [cleanRow("R1"), cleanRow("R2")] },
				},
			],
			[],
		).verdict,
		"approve",
	);
});
