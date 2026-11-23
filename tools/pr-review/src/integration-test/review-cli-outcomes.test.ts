import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { after, before, beforeEach, test as it } from "node:test";
import { nonnull } from "../domain/nullish.ts";
import { AZURE_REVIEWER_ID } from "./azure-mocks.ts";
import {
	type AzureOutcomeRecorder,
	createAzureOutcomeRecorderHandlers,
} from "./azure-outcome-mocks.ts";
import {
	createGitHubReviewRecorderHandler,
	type GitHubReviewRecord,
} from "./github-scenario-mocks.ts";
import {
	mockServer,
	resetHostMocks,
	startMockBridge,
	stopMockBridge,
} from "./mock-server.ts";
import { runScenario } from "./scenario.ts";
import {
	cleanupReviewToolForTest,
	installReviewToolForTest,
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

function submittedOutcomeOf(run: Awaited<ReturnType<typeof runScenario>>) {
	return nonnull(run.status.submittedOutcome);
}

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
	const baselineOutcome = nonnull(nonnull(runs[0]).status.submittedOutcome);
	assert.equal(baselineOutcome.verdict, "request-changes");
	assert.deepEqual(
		runs.map(submittedOutcomeOf),
		runs.map(() => baselineOutcome),
	);
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
			body: nonnull(baselineOutcome.inline[0]).body,
		},
	]);
	assert.deepEqual(azOutcome.inlineThreads, [
		{
			filePath: "/service.ts",
			line: 2,
			content: nonnull(baselineOutcome.inline[0]).body,
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
