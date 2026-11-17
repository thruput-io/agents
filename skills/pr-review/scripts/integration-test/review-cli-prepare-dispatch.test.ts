import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test as it } from "node:test";
import type { DispatchResult } from "../domain/contracts.g.ts";
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
import { mockServer } from "./mock-server.ts";
import { setupReviewCliHarness } from "./review-cli-harness.ts";
import { runScenario } from "./scenario.ts";

const repo = setupReviewCliHarness();

it("Review CLI prepares merge-base surface, preserves trailing blank lines, skips 0-hunk files, and posts identical outcomes across Git, GitHub, and AzureDevOps", async () => {
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
		{ label: "scenario-git", target: repo.gitTarget },
		{ label: "scenario-github", target: repo.githubTarget },
		{ label: "scenario-azure", target: repo.azureTarget },
	] as const;
	const runs = await Promise.all(
		adapters.map(({ label, target }) => runScenario(repo, target, label)),
	);

	const baseline = nonnull(runs[0]);
	const baselineInspected = nonnull(baseline.inspected[0]);
	const baselineSubmitted = baseline.dispatched as Extract<
		DispatchResult,
		{ kind: "submitted" }
	>;
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
	assert.equal(baselineSubmitted.outcome.verdict, "request-changes");

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
		assert.equal(
			readFileSync(
				join(run.workdir.snapshotDirectory().toString(), "helper.ts"),
				"utf8",
			),
			"export const z = 3;\n\n",
		);
		assert.equal(
			existsSync(
				join(
					run.workdir.toString(),
					"instructions",
					`${nonnull(run.invoked[0])}.json`,
				),
			),
			true,
		);
		assert.equal(
			existsSync(
				join(
					run.workdir.ledgerDirectory().toString(),
					`${nonnull(run.invoked[0])}.json`,
				),
			),
			true,
		);
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
		{ reviewerId: AZURE_REVIEWER_ID, vote: -10 },
	]);
});
