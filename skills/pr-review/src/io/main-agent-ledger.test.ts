import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as it } from "node:test";
import { Worker } from "node:worker_threads";
import { GithubPullRequest } from "../domain/code-under-review.ts";
import type { Ledger, Row } from "../domain/contracts.g.ts";
import type { ContextProbe, RulesProbe } from "../domain/ledger.ts";
import { nonnull } from "../domain/nullish.ts";
import { ContextSubAgentLedger } from "./context-sub-agent-ledger.ts";
import { coordinateLedgers } from "./coordinate-ledgers.ts";
import { DeadCodeSubAgentLedger } from "./dead-code-sub-agent-ledger.ts";
import { LedgerDirectory } from "./ledger-directory.ts";
import { ReuseSubAgentLedger } from "./reuse-sub-agent-ledger.ts";
import { RulesSubAgentLedger } from "./rules-sub-agent-ledger.ts";

const SHA1_HEX_LENGTH = 40;
const H = "a".repeat(SHA1_HEX_LENGTH);
const PR = nonnull(
	GithubPullRequest.from({
		kind: "github",
		owner: "thruput-io",
		repository: "agents",
		number: 14,
	}).data,
);
const surface = {
	headCommit: H,
	files: [
		{
			path: "p",
			fragments: [
				{
					kind: "surface" as const,
					side: "head" as const,
					lines: [{ idToReportViolationOn: "p:2", text: "L2" }],
				},
			],
		},
	],
};
const probe: RulesProbe = {
	surface,
	rulebook: { rules: [{ id: "A" }, { id: "B" }] },
};
const contextProbe: ContextProbe = {
	surface,
	rulesets: [{ url: "https://books.example/ddd.md" }],
};
const rulesSpec = (
	name: string,
	kind: "rules" | "dead-code",
	id: string,
	parent: string,
) => ({
	name,
	kind,
	probe: { surface, rulebook: { rules: [{ id, parent }] } },
});
const CLEAN = { examined: ["x"], verdict: "clean" as const, evidence: "e" };
const cleanRow = (rule: string): Row => ({ rule, ...CLEAN });
const cleanBookRow = (heading: string): Row => ({
	bookRule: { ruleset: "https://books.example/ddd.md", heading },
	...CLEAN,
});

const readSlicesUntilDone = async (
	dir: LedgerDirectory,
	isDone: () => boolean,
	collected: Ledger[],
): Promise<readonly Ledger[]> => {
	collected.push(nonnull(dir.readSlice("01-rules")));
	if (isDone()) {
		return collected;
	}
	await new Promise((resolve) => setImmediate(resolve));
	return readSlicesUntilDone(dir, isDone, collected);
};

it("coordinateLedgers records each probe slice to disk, tracks MainAgentLedger status, and auto-submits the merged outcome when the last probe reports", () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "ledger-test-"));
	const dir = nonnull(LedgerDirectory.from(tempRoot).data);
	const { ledgers, mainLedger } = coordinateLedgers(dir, PR, [
		rulesSpec("01-rules", "rules", "A", "You aren't gonna need it"),
		rulesSpec("02-dead-code", "dead-code", "B", "Fail fast"),
	]);

	assert.equal(mainLedger.directory().equals(dir), true);
	assert.deepEqual(mainLedger.pullRequest().host(), PR.host());
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
		{
			rule: "B",
			examined: ["x"],
			verdict: "violation",
			evidence: "e",
			violations: [
				{ rule: "B", idToReportViolationOn: "p:2", observation: "bad" },
			],
		},
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
	const dir = nonnull(LedgerDirectory.from("/tmp/ledger").data);
	const cleanRows = [cleanRow("A"), cleanRow("B")];
	const rulesSub = RulesSubAgentLedger.from(dir, PR, probe);
	assert.equal(rulesSub.path().toString(), "/tmp/ledger");
	const rulesResult = rulesSub.report(cleanRows);
	assert.equal(rulesResult.success, true);
	assert.equal(rulesResult.data.kind, "recorded");
	assert.equal(rulesResult.data.ledger.headCommit, H);
	assert.equal(rulesSub.report([cleanRow("A")]).success, false);

	for (const [ledger, rows] of [
		[rulesSub, cleanRows],
		[DeadCodeSubAgentLedger.from(dir, PR, probe), cleanRows],
		[ReuseSubAgentLedger.from(dir, PR, probe), cleanRows],
		[
			ContextSubAgentLedger.from(dir, PR, contextProbe),
			[cleanBookRow("x"), cleanBookRow("y"), cleanBookRow("z")],
		],
	] as const) {
		assert.equal(ledger.path().equals(dir), true);
		assert.deepEqual(ledger.pullRequest().host(), PR.host());
		assert.equal(ledger.report(rows).success, true);
	}
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
		`const { workerData, parentPort } = require("node:worker_threads");
		const { LedgerDirectory } = require(workerData.modulePath);
		const dir = LedgerDirectory.from(workerData.tempRoot).data;
		for (let i = 0; i < 300; i += 1) {
			dir.writeSlice("01-rules", workerData.sampleLedger);
		}
		parentPort.postMessage("done");`,
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
		const slices = await readSlicesUntilDone(dir, () => done, []);
		assert.equal(slices.length > 0, true);
		assert.equal(
			slices.every(
				(slice) => slice.headCommit === H && slice.rows.length === 2,
			),
			true,
		);
	} finally {
		await writer.terminate();
		rmSync(tempRoot, { recursive: true, force: true });
	}
});
