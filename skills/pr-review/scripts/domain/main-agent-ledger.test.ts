import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as it } from "node:test";
import { Worker } from "node:worker_threads";
import { CodeUnderReviewFactory } from "../adapters/code-under-review-factory.ts";
import { ContextSubAgentLedger } from "./context-sub-agent-ledger.ts";
import type { Row, RuleRef, Violation } from "./contracts.g.ts";
import { DeadCodeSubAgentLedger } from "./dead-code-sub-agent-ledger.ts";
import type { ContextProbe, RulesProbe } from "./ledger.ts";
import { LedgerDirectory } from "./ledger-directory.ts";
import { coordinateLedgers } from "./main-agent-ledger.ts";
import { nonnull } from "./nullish.ts";
import { ReuseSubAgentLedger } from "./reuse-sub-agent-ledger.ts";
import { RulesSubAgentLedger } from "./rules-sub-agent-ledger.ts";

const SHA1_HEX_LENGTH = 40;
const H = "a".repeat(SHA1_HEX_LENGTH);
const SURFACE_START_END = 5;
const CONTEXT_START = 6;
const CONTEXT_END = 8;
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
				lines: run(1, SURFACE_START_END),
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
const contextProbe: ContextProbe = {
	surface: { headCommit: H, files },
	rulesets: [
		{ url: "https://books.example/ddd.md" },
		{ url: "https://books.example/clean-code.md" },
	],
};
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

const readSlicesUntilDone = async (
	dir: LedgerDirectory,
	isDone: () => boolean,
	collected: Array<{
		readonly headCommit: string;
		readonly rowCount: number;
	}> = [],
): Promise<
	readonly { readonly headCommit: string; readonly rowCount: number }[]
> => {
	const slice = nonnull(dir.readSlice("01-rules"));
	collected.push({
		headCommit: slice.headCommit,
		rowCount: slice.rows.length,
	});
	if (isDone()) {
		return collected;
	}
	await new Promise((resolve) => setImmediate(resolve));
	return readSlicesUntilDone(dir, isDone, collected);
};

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
		violatedRow("B", [violationAt("B", 2)]),
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

it("LedgerDirectory.writeSlice writes atomically so concurrent readSlice calls never observe partial JSON", async () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "ledger-atomic-"));
	const dir = nonnull(LedgerDirectory.from(tempRoot).data);
	dir.initialize();
	const sampleLedger = {
		headCommit: H,
		rows: [cleanRow("A"), cleanRow("B")],
	};
	dir.writeSlice("01-rules", sampleLedger);
	const writer = new Worker(
		`
		const { workerData, parentPort } = require("node:worker_threads");
		const { LedgerDirectory } = require(workerData.modulePath);
		const dir = LedgerDirectory.from(workerData.tempRoot).data;
		for (let i = 0; i < 300; i += 1) {
			dir.writeSlice("01-rules", workerData.sampleLedger);
		}
		parentPort.postMessage("done");
		`,
		{
			eval: true,
			workerData: {
				modulePath: new URL("./ledger-directory.ts", import.meta.url).pathname,
				tempRoot,
				sampleLedger,
			},
		},
	);
	let done = false;
	writer.on("message", () => {
		done = true;
	});
	try {
		const slices = await readSlicesUntilDone(dir, () => done);
		assert.equal(slices.length > 0, true);
		assert.equal(
			slices.every((slice) => slice.headCommit === H && slice.rowCount === 2),
			true,
		);
	} finally {
		await writer.terminate();
		rmSync(tempRoot, { recursive: true, force: true });
	}
});
