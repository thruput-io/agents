import assert from "node:assert/strict";
import { test as it } from "node:test";
import type { Ledger, Row, RuleRef, Violation } from "./contracts.g.ts";
import { CELL, merge, table, verdict } from "./ledger-table.ts";
import { nonnull } from "./nullish.ts";
import { alreadyOpen, outcome, settled } from "./outcome.ts";
import { citation, message, SITE } from "./rulebook.ts";

const H = "a".repeat(40);
const URL_DDD = "https://books.example/ddd.md";
const PIPE_AND_NEWLINE_RE = /has \\\| pipe and newline/u;
const ELLIPSIS_RE = /…/u;
const BOOK_RULE_ROW_RE = /\n\| Book rule \| x \| violation \| e \|$/u;
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
					{ idToReportViolationOn: 3, text: "x3" },
					{ idToReportViolationOn: 4, text: "x4" },
					{ idToReportViolationOn: 7, text: "x7" },
				],
			},
			{
				kind: "surface" as const,
				side: "base" as const,
				lines: [{ idToReportViolationOn: 9, text: "y9" }],
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
const bookRule = (heading: string) => ({
	ruleset: URL_DDD,
	heading,
});
const cleanBookRow = (heading: string): Row => ({
	bookRule: bookRule(heading),
	examined: ["x"],
	verdict: "clean",
	evidence: "e",
});
const violation = (
	rule: RuleRef,
	idToReportViolationOn?: number,
): Violation => ({
	rule,
	...(idToReportViolationOn === undefined ? {} : { idToReportViolationOn }),
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
const violatedBookRow = (heading: string, violations: Violation[]): Row => ({
	bookRule: bookRule(heading),
	examined: ["x"],
	verdict: "violation",
	evidence: "e",
	violations,
});
const sampleLedger: Ledger = {
	headCommit: H,
	rows: [
		violatedRow("A", [violation("A", 3), violation("A")]),
		{
			rule: "B",
			examined: ["x"],
			verdict: "clean",
			evidence: `has | pipe\nand newline ${"x".repeat(CELL)}`,
		},
	],
};
const contextLedger: Ledger = {
	headCommit: H,
	rows: [violatedBookRow("Book rule", [violation(bookRule("Book rule"), 9)])],
};
const entries = [
	{ document: outcomeProbe, ledger: sampleLedger },
	{ document: contextProbe, ledger: contextLedger },
];

it("merge concatenates rows into one ledger", () => {
	assert.deepEqual(
		merge([
			{ headCommit: H, rows: [cleanRow("A")] },
			{ headCommit: H, rows: [cleanBookRow("x")] },
		]),
		{ headCommit: H, rows: [cleanRow("A"), cleanBookRow("x")] },
	);
});

it("verdict follows any violation", () => {
	assert.equal(verdict(sampleLedger), "request-changes");
	assert.equal(verdict({ rows: [cleanRow("A")] }), "approve");
});

it("table escapes pipes and newlines, caps a cell, and names a book rule by its heading", () => {
	const rendered = table(sampleLedger);
	const fourthLine = nonnull(rendered.split("\n")[3]);
	assert.match(rendered, PIPE_AND_NEWLINE_RE);
	assert.equal(fourthLine.length > 0 && fourthLine.length < CELL + 100, true);
	assert.match(rendered, ELLIPSIS_RE);
	assert.match(table(contextLedger), BOOK_RULE_ROW_RE);
});

it("alreadyOpen matches an open thread on the same line citing the same principle", () => {
	const open = [
		{ path: "p", lines: { start: 3, end: 3 }, body: `earlier breaks ${citeP}` },
	];
	assert.equal(alreadyOpen(violation("A", 3), citeP, open, files), true);
	assert.equal(alreadyOpen(violation("A", 4), citeP, open, files), false);
	assert.equal(
		alreadyOpen(violation("A", 3), `[Q](${SITE}#q)`, open, files),
		false,
	);
	assert.equal(alreadyOpen(violation("A"), citeP, open, files), false);
});

it("settled lists the open threads that no finding of this review carries any more", () => {
	const document = {
		surface: {
			headCommit: H,
			files: [
				{
					path: "a.sh",
					fragments: [
						{
							kind: "surface" as const,
							side: "head" as const,
							lines: [
								{ idToReportViolationOn: 3, text: "c" },
								{ idToReportViolationOn: 4, text: "d" },
							],
						},
					],
				},
			],
		},
		rulebook: { rules: [{ id: "R", parent: "P" }] },
	};
	const v: Violation = {
		rule: "R",
		idToReportViolationOn: 4,
		observation: "x",
	};
	const row: Row = {
		rule: "R",
		verdict: "violation",
		examined: ["a.sh"],
		evidence: "e",
		violations: [v],
	};
	const l: Ledger = { headCommit: H, rows: [row] };
	const threads = [
		{
			id: 1,
			path: "a.sh",
			lines: { start: 4, end: 4 },
			body: message(v, citation(document, row)),
		},
		{
			id: 2,
			path: "a.sh",
			lines: { start: 9, end: 9 },
			body: message(v, citation(document, row)),
		},
		{
			id: 3,
			path: "b.sh",
			lines: { start: 1, end: 1 },
			body: "something else breaks [P](https://thruput.se/agents/#p)",
		},
	];
	assert.deepEqual(
		settled([{ document, ledger: l }], threads).map((thread) => thread.id),
		[2, 3],
	);
});

it("outcome produces the verdict, summary, fresh inline findings, threads to settle, and threads to reopen, and re-flags violations on resolved threads", () => {
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
		side: "base" as const,
		lines: { start: 9, end: 9 },
		state: "resolved-by-author" as const,
		body: "earlier breaks [Book rule](https://books.example/ddd.md)",
	};
	const settledByReviewer = {
		id: "s",
		path: "p",
		side: "head" as const,
		lines: { start: 3, end: 3 },
		state: "resolved" as const,
		body: `earlier breaks ${citeP}`,
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
			side: "base",
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
