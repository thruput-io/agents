import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as it } from "node:test";
import { z } from "zod";
import type { Anchor, Row, Violation } from "./contracts.g.ts";
import {
	anchorInside,
	type ContextProbe,
	type LedgerProbe,
	ledgerFor,
	type RulesProbe,
} from "./ledger.ts";
import { LedgerDirectory } from "./ledger-directory.ts";
import { coordinateLedgers } from "./main-agent-ledger.ts";
import { nonnull } from "./nullish.ts";
import { CodeUnderReviewFactory } from "./review-snapshot.ts";
import {
	ContextSubAgentLedger,
	DeadCodeSubAgentLedger,
	ReuseSubAgentLedger,
	RulesSubAgentLedger,
} from "./sub-agent-ledger.ts";

const MISSING_B_RE = /missing: \["B"\]/u;
const EXTRA_Z_RE = /extra: \["Z"\]/u;
const IN_ORDER_RE = /in order/u;
const FOREIGN_COMMIT_RE = /ledger is for b{40}/u;
const OUTSIDE_SURFACE_RE = /violation of A is anchored outside the surface/u;
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
	return parsed.success ? "" : z.prettifyError(parsed.error);
};

const H = "a".repeat(40);
const OTHER = "b".repeat(40);
const PREFIX = { head: "L", base: "R" } as const;

const text = (side: "head" | "base", n: number) => `${PREFIX[side]}${n}`;
const run = (side: "head" | "base", from: number, to: number) =>
	Array.from({ length: to - from + 1 }, (_, i) => ({
		idToReportViolationOn: from + i,
		text: text(side, from + i),
	}));
const contextRun = (side: "head" | "base", from: number, to: number) =>
	Array.from({ length: to - from + 1 }, (_, i) => text(side, from + i));
const files = [
	{
		path: "p",
		fragments: [
			{
				kind: "surface" as const,
				side: "head" as const,
				lines: run("head", 1, 5),
			},
			{ kind: "context" as const, lines: contextRun("head", 6, 8) },
			{
				kind: "surface" as const,
				side: "base" as const,
				lines: run("base", 9, 9),
			},
		],
	},
];
const probe: RulesProbe = {
	surface: { headCommit: H, files },
	rulebook: { rules: [{ id: "A" }, { id: "B" }] },
};
const contextProbe: ContextProbe = {
	surface: { headCommit: H, files },
	rulesets: [
		{ url: "https://books.example/ddd.md" },
		{ url: "https://books.example/clean-code.md" },
	],
};

const lines = (
	path: string,
	start: number,
	end: number,
	side: "head" | "base",
): Anchor => ({
	kind: "surface",
	path,
	side,
	lines: run(side, start, end),
});
const atPullRequest: Anchor = { kind: "pull-request" };
const violation = (anchor: Anchor): Violation => ({
	observation: "what is wrong",
	anchor,
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
const bookRule = (heading: string) => ({
	ruleset: "https://books.example/ddd.md",
	heading,
});
const cleanBookRow = (heading: string): Row => ({
	bookRule: bookRule(heading),
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

it("anchorInside accepts lines copied from one surface fragment on their side, and the pull request", () => {
	assert.equal(anchorInside(lines("p", 3, 3, "head"), files), true);
	assert.equal(anchorInside(lines("p", 1, 5, "head"), files), true);
	assert.equal(anchorInside(lines("p", 9, 9, "base"), files), true);
	assert.equal(anchorInside(atPullRequest, files), true);
	assert.equal(anchorInside(lines("p", 6, 6, "head"), files), false);
	assert.equal(anchorInside(lines("p", 3, 3, "base"), files), false);
	assert.equal(anchorInside(lines("q", 1, 1, "head"), files), false);
	assert.equal(
		anchorInside(
			{
				kind: "surface",
				path: "p",
				side: "head",
				lines: [{ idToReportViolationOn: 3, text: "edited" }],
			},
			files,
		),
		false,
	);
	assert.equal(
		anchorInside(
			{ kind: "surface", path: "p", side: "head", lines: [] },
			files,
		),
		false,
	);
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
	const rows = (anchor: Anchor) => [
		violatedRow("A", [violation(anchor)]),
		cleanRow("B"),
	];
	assert.equal(
		ledgerFor(probe).decode({
			headCommit: H,
			rows: rows(lines("p", 2, 2, "head")),
		}).rows.length,
		2,
	);
	assert.equal(
		ledgerFor(probe).decode({ headCommit: H, rows: rows(atPullRequest) }).rows
			.length,
		2,
	);
	assert.match(
		rejectionMessage(probe, {
			headCommit: H,
			rows: rows(lines("p", 7, 7, "head")),
		}),
		OUTSIDE_SURFACE_RE,
	);
});

it("the ledger schema requires exactly three rows on rules of one ruleset the context probe was handed", () => {
	assert.equal(
		ledgerFor(contextProbe).decode({
			headCommit: H,
			rows: [cleanBookRow("x"), cleanBookRow("y"), cleanBookRow("z")],
		}).rows.length,
		3,
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

it("coordinateLedgers records each probe slice to disk, tracks MainAgentLedger status, and auto-submits the merged outcome when the last probe reports", () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "ledger-test-"));
	const dir = LedgerDirectory.from(tempRoot);
	const pr = CodeUnderReviewFactory.from(
		"https://github.com/thruput-io/agents/pull/14",
	);
	assert.equal(dir.success, true);
	assert.equal(pr.success, true);

	const firstProbe = {
		surface: { headCommit: H, files },
		rulebook: {
			rules: [{ id: "A", parent: "You aren't gonna need it" }],
		},
	};
	const secondProbe = {
		surface: { headCommit: H, files },
		rulebook: {
			rules: [{ id: "B", parent: "Fail fast" }],
		},
	};
	const { ledgers, mainLedger } = coordinateLedgers(dir.data, pr.data, [
		{ name: "01-rules", kind: "rules", probe: firstProbe },
		{ name: "02-dead-code", kind: "dead-code", probe: secondProbe },
	]);

	assert.equal(mainLedger.directory().equals(dir.data), true);
	assert.deepEqual(mainLedger.pullRequest().host(), pr.data.host());
	assert.deepEqual(mainLedger.pending(), ["01-rules", "02-dead-code"]);
	assert.deepEqual(mainLedger.completed(), []);
	assert.equal(mainLedger.submittedOutcome(), null);
	assert.equal(mainLedger.submittedLedger(), null);

	const firstReport = nonnull(ledgers[0]).report([cleanRow("A")]);
	assert.equal(firstReport.success, true);
	assert.equal(firstReport.data.kind, "recorded");
	assert.equal(existsSync(join(tempRoot, "01-rules.json")), true);
	assert.deepEqual(mainLedger.pending(), ["02-dead-code"]);
	assert.deepEqual(mainLedger.completed(), ["01-rules"]);

	const secondReport = nonnull(ledgers[1]).report([
		violatedRow("B", [violation(lines("p", 2, 2, "head"))]),
	]);
	assert.equal(secondReport.success, true);
	assert.equal(secondReport.data.kind, "submitted");
	assert.equal(secondReport.data.ledger.rows.length, 2);
	assert.equal(existsSync(join(tempRoot, "02-dead-code.json")), true);
	assert.deepEqual(mainLedger.pending(), []);
	assert.deepEqual(mainLedger.completed(), ["01-rules", "02-dead-code"]);
	assert.equal(mainLedger.submittedOutcome()?.verdict, "request-changes");
	assert.equal(mainLedger.submittedLedger()?.rows.length, 2);

	rmSync(tempRoot, { recursive: true, force: true });
});

it("RulesSubAgentLedger, DeadCodeSubAgentLedger, ReuseSubAgentLedger, and ContextSubAgentLedger parse rows against their probes", () => {
	const dir = LedgerDirectory.from("/tmp/ledger");
	const pr = CodeUnderReviewFactory.from(
		"https://github.com/thruput-io/agents/pull/14",
	);
	assert.equal(dir.success, true);
	assert.equal(pr.success, true);

	const rulesSub = RulesSubAgentLedger.from(dir.data, pr.data, probe);
	assert.equal(rulesSub.path().equals(dir.data), true);
	assert.equal(rulesSub.path().toString(), "/tmp/ledger");
	assert.deepEqual(rulesSub.pullRequest().host(), pr.data.host());
	const rulesResult = rulesSub.report([cleanRow("A"), cleanRow("B")]);
	assert.equal(rulesResult.success, true);
	assert.equal(rulesResult.data.kind, "recorded");
	assert.equal(rulesResult.data.ledger.headCommit, H);
	assert.equal(rulesSub.report([cleanRow("A")]).success, false);

	const deadCodeSub = DeadCodeSubAgentLedger.from(dir.data, pr.data, probe);
	assert.equal(deadCodeSub.path().equals(dir.data), true);
	assert.deepEqual(deadCodeSub.pullRequest().host(), pr.data.host());
	assert.equal(
		deadCodeSub.report([cleanRow("A"), cleanRow("B")]).success,
		true,
	);

	const reuseSub = ReuseSubAgentLedger.from(dir.data, pr.data, probe);
	assert.equal(reuseSub.path().equals(dir.data), true);
	assert.deepEqual(reuseSub.pullRequest().host(), pr.data.host());
	assert.equal(reuseSub.report([cleanRow("A"), cleanRow("B")]).success, true);

	const contextSub = ContextSubAgentLedger.from(
		dir.data,
		pr.data,
		contextProbe,
	);
	assert.equal(contextSub.path().equals(dir.data), true);
	assert.deepEqual(contextSub.pullRequest().host(), pr.data.host());
	assert.equal(
		contextSub.report([cleanBookRow("x"), cleanBookRow("y"), cleanBookRow("z")])
			.success,
		true,
	);
});
