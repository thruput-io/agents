import assert from "node:assert/strict";
import { test as it } from "node:test";
import type { Row, RuleRef, Violation } from "./contracts.g.ts";
import { outcome } from "./outcome.ts";
import { SITE } from "./rulebook.ts";

const SHA1_HEX_LENGTH = 40;
const H = "a".repeat(SHA1_HEX_LENGTH);
const citeP = `[P](${SITE}#p)`;

const violatedRow = (rule: string, violations: Violation[]): Row => ({
	rule,
	examined: ["x"],
	verdict: "violation",
	evidence: "e",
	violations,
});

const violationAt = (
	rule: RuleRef,
	idToReportViolationOn: string,
): Violation => ({
	rule,
	idToReportViolationOn,
	observation: "what is wrong",
});

it("outcome resolves inline findings across multiple files", () => {
	const multiFileProbe = {
		review: {
			headCommit: H,
			files: [
				{
					path: "helper.ts",
					fragments: [
						{
							kind: "surface" as const,
							side: "head" as const,
							lines: [
								{ idToReportViolationOn: "helper.ts:1", text: "a" },
								{ idToReportViolationOn: "helper.ts:2", text: "b" },
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
							lines: [{ idToReportViolationOn: "service.ts:2", text: "y" }],
						},
					],
				},
			],
		},
		rulebook: { rules: [{ id: "A", parent: "P" }] },
	};
	const multiFileResult = outcome(
		[
			{
				document: multiFileProbe,
				ledger: {
					headCommit: H,
					rows: [violatedRow("A", [violationAt("A", "service.ts:2")])],
				},
			},
		],
		[],
	);
	assert.deepEqual(multiFileResult.inline, [
		{
			path: "service.ts",
			side: "head",
			lines: { start: 2, end: 2 },
			body: `what is wrong breaks ${citeP}`,
		},
	]);
});
