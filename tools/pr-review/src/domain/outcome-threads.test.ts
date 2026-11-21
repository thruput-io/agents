import assert from "node:assert/strict";
import { test as it } from "node:test";
import type { Ledger, Row, RuleRef, Violation } from "./contracts.g.ts";
import { alreadyOpen, settled } from "./outcome.ts";
import { citation, message, SITE } from "./rulebook.ts";

const SHA1_HEX_LENGTH = 40;
const H = "a".repeat(SHA1_HEX_LENGTH);
const FIRST_UNCARRIED_ID = 2;
const SECOND_UNCARRIED_ID = 3;
const UNCARRIED_THREAD_IDS = [FIRST_UNCARRIED_ID, SECOND_UNCARRIED_ID];
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
				],
			},
		],
	},
];
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

it("alreadyOpen matches an open thread on the same line citing the same principle", () => {
	const open = [
		{ path: "p", lines: { start: 3, end: 3 }, body: `earlier breaks ${citeP}` },
	];
	assert.equal(alreadyOpen(violationAt("A", "p:3"), citeP, open, files), true);
	assert.equal(alreadyOpen(violationAt("A", "p:4"), citeP, open, files), false);
	assert.equal(
		alreadyOpen(violationAt("A", "p:3"), `[Q](${SITE}#q)`, open, files),
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
								{ idToReportViolationOn: "a.sh:3", text: "c" },
								{ idToReportViolationOn: "a.sh:4", text: "d" },
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
		idToReportViolationOn: "a.sh:4",
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
		UNCARRIED_THREAD_IDS,
	);
});
