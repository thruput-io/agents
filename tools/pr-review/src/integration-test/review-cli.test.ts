import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, test as it } from "node:test";
import {
	PrepareReadySchema,
	PrepareResponseSchema,
	ReviewStatusSchema,
} from "../domain/contracts.g.ts";
import { nonnull } from "../domain/nullish.ts";
import {
	resetHostMocks,
	startMockBridge,
	stopMockBridge,
} from "./mock-server.ts";
import { reportForProbe, runScenario } from "./scenario.ts";
import {
	cleanupReviewToolForTest,
	installReviewToolForTest,
	invokeMainCli,
} from "./scenario-cli.ts";
import { createScenarioRepo } from "./scenario-repo.ts";

const repo = createScenarioRepo();

before(async () => {
	installReviewToolForTest();
	await startMockBridge();
});

beforeEach(() => {
	resetHostMocks(repo);
});

after(async () => {
	await stopMockBridge();
	cleanupReviewToolForTest();
	rmSync(repo.rootDir, { recursive: true, force: true });
});

const runPathsFor = (run: Awaited<ReturnType<typeof runScenario>>) => ({
	helperSnap: join(run.workdir.snapshotDirectory().toString(), "helper.ts"),
	auditFile: join(
		run.workdir.toString(),
		"instructions",
		`${nonnull(run.invoked[0])}.json`,
	),
	sliceFile: join(
		run.workdir.ledgerDirectory().toString(),
		`${nonnull(run.invoked[0])}.json`,
	),
});

function summarizePreparedRun(run: Awaited<ReturnType<typeof runScenario>>) {
	const firstInspected = nonnull(run.inspected[0]);
	const firstProbe = nonnull(run.invoked[0]);
	const { helperSnap, auditFile, sliceFile } = runPathsFor(run);
	return {
		invoked: run.invoked,
		hasLeak:
			"change" in run.prepared ||
			"headCommit" in run.prepared ||
			"rulesets" in run.prepared,
		firstPromptMatches:
			run.prepared.prompt ===
			"Run <skill>/dist/bin/review-tool-probe.mjs -h && <skill>/dist/bin/review-tool-probe.mjs ack <session> <probe> and follow its instructions.",
		firstPermission: run.prepared.permissions[firstProbe],
		author: firstInspected.change.author,
		description: firstInspected.change.description,
		changedFiles: firstInspected.surface.changedFiles,
		pagePaths: run.pages.flatMap((p) => p.files.map((f) => f.path)),
		firstHasCheckout: "checkout" in firstInspected,
		checkoutMatch: run.inspected.every(
			(entry) => "checkout" in entry === (entry.kind !== "rules"),
		),
		helperSnapContent: readFileSync(helperSnap, "utf8"),
		auditExists: existsSync(auditFile),
		sliceExists: existsSync(sliceFile),
	};
}

it("Review CLI prepares identical surfaces across Git, GitHub, and AzureDevOps", async () => {
	const adapters = [
		{ label: "scenario-git", target: repo.gitTarget },
		{ label: "scenario-github", target: repo.githubTarget },
		{ label: "scenario-azure", target: repo.azureTarget },
	] as const;
	const runs = await Promise.all(
		adapters.map(({ label, target }) => runScenario(repo, target, label)),
	);
	const baseline = nonnull(runs[0]);
	const baselineInspected = nonnull(baseline.inspected[0]);
	assert.equal(baseline.invoked.length > 1, true);
	assert.equal(baselineInspected.change.author, "author@example.com");
	assert.equal(
		baselineInspected.change.description,
		"Refine helper\n\nSecond body.\n\nAdd y export\n\nFirst body.",
	);
	assert.equal(baselineInspected.surface.changedFiles, 2);
	assert.deepEqual(
		baseline.pages.flatMap((p) => p.files.map((f) => f.path)),
		["helper.ts", "service.ts"],
	);
	assert.deepEqual(
		runs.map(summarizePreparedRun),
		runs.map(() => ({
			invoked: baseline.invoked,
			hasLeak: false,
			firstPromptMatches: true,
			firstPermission: ["Bash(review-tool-probe.mjs*)"],
			author: baselineInspected.change.author,
			description: baselineInspected.change.description,
			changedFiles: 2,
			pagePaths: ["helper.ts", "service.ts"],
			firstHasCheckout: false,
			checkoutMatch: true,
			helperSnapContent: "export const z = 3;\n\n",
			auditExists: true,
			sliceExists: true,
		})),
	);
});

it("Review CLI reports pending probes on partial completion and submits once remaining probes report", async () => {
	const workdir = repo.workdirFor("scenario-retry");
	const prepared = await invokeMainCli(
		["prepare", repo.gitTarget, workdir.toString()],
		PrepareResponseSchema,
	);
	assert.equal(prepared.exitCode, 0);
	const ready = PrepareReadySchema.parse(prepared.payload);
	const contextProbes = ready.pending.filter((n) => n.endsWith("-context"));
	const rulebookProbes = ready.pending.filter((n) => !n.endsWith("-context"));
	await Promise.all(
		rulebookProbes.map((name) => reportForProbe(ready.session, name)),
	);

	const firstStatus = await invokeMainCli(
		["status", workdir.toString()],
		ReviewStatusSchema,
	);
	assert.equal(firstStatus.exitCode, 0);
	assert.deepEqual(firstStatus.payload.pending, contextProbes);
	assert.equal(firstStatus.payload.submittedOutcome, null);
	assert.equal(firstStatus.payload.location, null);

	await Promise.all(
		contextProbes.map((name) => reportForProbe(ready.session, name)),
	);

	const secondStatus = await invokeMainCli(
		["status", workdir.toString()],
		ReviewStatusSchema,
	);
	assert.equal(secondStatus.exitCode, 0);
	assert.deepEqual(secondStatus.payload.pending, []);
	assert.deepEqual(secondStatus.payload.completed, [...ready.pending]);
	assert.notEqual(secondStatus.payload.submittedOutcome, null);
	assert.notEqual(secondStatus.payload.location, null);
});
