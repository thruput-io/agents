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
	const firstPage = nonnull(run.pages[0]);
	const firstChange = nonnull(firstPage.change);
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
			"Run <skill>/dist/bin/review-tool-probe.mjs instructions <session> <probe> and follow its instructions.",
		firstPermission: run.prepared.permissions[firstProbe],
		author: firstChange.author,
		description: firstChange.description,
		changedFiles: firstPage.totalFiles,
		pagePaths: run.pages.map((p) => p.path),
		firstHasCheckout: "checkout" in firstInspected,
		checkoutMatch: run.inspected.every(
			(entry) => "checkout" in entry === entry.permissions.length > 1,
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
	const baselineFirstPage = nonnull(baseline.pages[0]);
	const baselineChange = nonnull(baselineFirstPage.change);
	assert.equal(baseline.invoked.length > 1, true);
	assert.equal(baselineChange.author, "author@example.com");
	assert.equal(
		baselineChange.description,
		"Refine helper\n\nSecond body.\n\nAdd y export\n\nFirst body.",
	);
	assert.equal(baselineFirstPage.totalFiles, 2);
	assert.deepEqual(
		baseline.pages.map((p) => p.path),
		["helper.ts", "service.ts"],
	);
	assert.deepEqual(
		runs.map(summarizePreparedRun),
		runs.map(() => ({
			invoked: baseline.invoked,
			hasLeak: false,
			firstPromptMatches: true,
			firstPermission: [
				"Read",
				"Grep",
				"Glob",
				"Find",
				"Bash(review-tool-probe.mjs*)",
			],
			author: baselineChange.author,
			description: baselineChange.description,
			changedFiles: 2,
			pagePaths: ["helper.ts", "service.ts"],
			firstHasCheckout: true,
			checkoutMatch: true,
			helperSnapContent: "export const z = 3;\n\n",
			auditExists: true,
			sliceExists: true,
		})),
	);
});

it("Review CLI status waits in code while remaining probes acknowledge and report", async () => {
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

	const [finalStatus] = await Promise.all([
		invokeMainCli(["status", workdir.toString()], ReviewStatusSchema),
		Promise.all(
			contextProbes.map((name) => reportForProbe(ready.session, name)),
		),
	]);
	assert.equal(finalStatus.exitCode, 0);
	assert.deepEqual(finalStatus.payload.pending, []);
	assert.deepEqual(finalStatus.payload.completed, [...ready.pending]);
	assert.equal(
		finalStatus.payload.submittedOutcome?.verdict,
		"request-changes",
	);
	assert.equal(
		finalStatus.payload.location?.startsWith("**Verdict: request-changes**"),
		true,
	);
});
