import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, test as it } from "node:test";
import {
	type DispatchResult,
	DispatchResultSchema,
	PrepareReadySchema,
	PrepareResponseSchema,
	ReviewStatusSchema,
} from "../domain/contracts.g.ts";
import { nonnull } from "../domain/nullish.ts";
import {
	AZURE_REVIEWER_ID,
	type AzureOutcomeRecorder,
	createAzureOutcomeRecorderHandlers,
} from "./azure-mocks.ts";
import {
	createGitHubReviewRecorderHandler,
	type GitHubReviewRecord,
} from "./github-mocks.ts";
import {
	mockServer,
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
const EXPECTED_VOTE_REJECT = -10;

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
		baseline.pages.map((p) => p.path),
		["helper.ts", "service.ts"],
	);
	for (const run of runs) {
		assert.deepEqual(run.invoked, baseline.invoked);
		assert.equal("change" in run.prepared, false);
		assert.equal("headCommit" in run.prepared, false);
		assert.equal("prompts" in run.prepared, false);
		assert.equal("rulesets" in run.prepared, false);
		assert.deepEqual(run.prepared.permissions[nonnull(run.invoked[0])], [
			"Bash(review-tool-probe*)",
		]);
		const firstInspected = nonnull(run.inspected[0]);
		assert.equal(firstInspected.change.author, baselineInspected.change.author);
		assert.equal(
			firstInspected.change.description,
			baselineInspected.change.description,
		);
		assert.equal(firstInspected.surface.changedFiles, 2);
		assert.deepEqual(
			run.pages.map((p) => p.path),
			["helper.ts", "service.ts"],
		);
		assert.equal("checkout" in firstInspected, false);
		for (const entry of run.inspected) {
			assert.equal("checkout" in entry, entry.kind !== "rules");
		}
		const { helperSnap, auditFile, sliceFile } = runPathsFor(run);
		assert.equal(readFileSync(helperSnap, "utf8"), "export const z = 3;\n\n");
		assert.equal(existsSync(auditFile), true);
		assert.equal(existsSync(sliceFile), true);
	}
});

it("Review CLI posts identical review outcomes to GitHub and AzureDevOps", async () => {
	const ghReviews: GitHubReviewRecord[] = [];
	const azOutcome: AzureOutcomeRecorder = {
		inlineThreads: [],
		summaryThreads: [],
		votes: [],
	};
	mockServer.use(
		createGitHubReviewRecorderHandler(ghReviews),
		...createAzureOutcomeRecorderHandlers(azOutcome),
	);
	const adapters = [
		{ label: "outcome-git", target: repo.gitTarget },
		{ label: "outcome-github", target: repo.githubTarget },
		{ label: "outcome-azure", target: repo.azureTarget },
	] as const;
	const runs = await Promise.all(
		adapters.map(({ label, target }) => runScenario(repo, target, label)),
	);
	const baselineSubmitted = nonnull(runs[0]).dispatched as Extract<
		DispatchResult,
		{ kind: "submitted" }
	>;
	assert.equal(baselineSubmitted.outcome.verdict, "request-changes");
	for (const run of runs) {
		const submitted = run.dispatched as Extract<
			DispatchResult,
			{ kind: "submitted" }
		>;
		assert.deepEqual(submitted.outcome, baselineSubmitted.outcome);
	}
	assert.equal(ghReviews.length, 1);
	const ghPosted = nonnull(ghReviews[0]);
	assert.equal(ghPosted.event, "REQUEST_CHANGES");
	assert.equal(ghPosted.commitId, repo.headCommit);
	assert.equal(ghPosted.body.startsWith("**Verdict: request-changes**"), true);
	assert.deepEqual(ghPosted.comments, [
		{
			path: "service.ts",
			line: 2,
			side: "RIGHT",
			body: nonnull(baselineSubmitted.outcome.inline[0]).body,
		},
	]);
	assert.deepEqual(azOutcome.inlineThreads, [
		{
			filePath: "/service.ts",
			line: 2,
			content: nonnull(baselineSubmitted.outcome.inline[0]).body,
		},
	]);
	assert.equal(azOutcome.summaryThreads.length, 1);
	assert.equal(
		nonnull(azOutcome.summaryThreads[0]).startsWith(
			"**Verdict: request-changes**",
		),
		true,
	);
	assert.deepEqual(azOutcome.votes, [
		{ reviewerId: AZURE_REVIEWER_ID, vote: EXPECTED_VOTE_REJECT },
	]);
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

	const firstDispatch = await invokeMainCli(
		["dispatch", workdir.toString()],
		DispatchResultSchema,
	);
	assert.equal(firstDispatch.exitCode, 0);
	assert.equal(firstDispatch.payload.kind, "pending");
	assert.deepEqual(firstDispatch.payload.remaining, contextProbes);

	const firstStatus = await invokeMainCli(
		["status", workdir.toString()],
		ReviewStatusSchema,
	);
	assert.equal(firstStatus.exitCode, 0);
	assert.deepEqual(firstStatus.payload.pending, contextProbes);
	assert.equal(firstStatus.payload.submittedOutcome, null);

	await Promise.all(
		contextProbes.map((name) => reportForProbe(ready.session, name)),
	);
	const secondDispatch = await invokeMainCli(
		["dispatch", workdir.toString()],
		DispatchResultSchema,
	);
	assert.equal(secondDispatch.exitCode, 0);
	assert.equal(secondDispatch.payload.kind, "submitted");

	const secondStatus = await invokeMainCli(
		["status", workdir.toString()],
		ReviewStatusSchema,
	);
	assert.equal(secondStatus.exitCode, 0);
	assert.deepEqual(secondStatus.payload.pending, []);
	assert.deepEqual(secondStatus.payload.completed, [...ready.pending]);
});
