import assert from "node:assert/strict";
import { test as it } from "node:test";
import type { Ledger, Row, RuleRef, Violation } from "./contracts.g.ts";
import { CELL, merge, table, verdict } from "./ledger-table.ts";
import { nonnull } from "./nullish.ts";

const SHA1_HEX_LENGTH = 40;
const H = "a".repeat(SHA1_HEX_LENGTH);
const URL_DDD = "https://books.example/ddd.md";
const PIPE_AND_NEWLINE_RE = /has \\\| pipe and newline/u;
const ELLIPSIS_RE = /…/u;
const BOOK_RULE_ROW_RE = /\n\| Book rule \| x \| violation \| e \|$/u;
const TABLE_OVERHEAD_BOUND = 100;

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
		violatedRow("A", [violationAt("A", "p:3"), violation("A")]),
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
	rows: [
		violatedBookRow("Book rule", [violationAt(bookRule("Book rule"), "p:9")]),
	],
};

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
	assert.equal(
		fourthLine.length > 0 && fourthLine.length < CELL + TABLE_OVERHEAD_BOUND,
		true,
	);
	assert.match(rendered, ELLIPSIS_RE);
	assert.match(table(contextLedger), BOOK_RULE_ROW_RE);
});
