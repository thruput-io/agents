import assert from "node:assert/strict";
import { test as it } from "node:test";
import { PrepareResponseSchema } from "../domain/contracts.g.ts";
import { DIFF_LIMIT_EXCEEDED } from "../domain/limits.ts";
import { nonnull } from "../domain/nullish.ts";
import {
	createAzureAlreadyReviewedHandler,
	createAzureExistingRefusalHandler,
	createRejectedAzurePolicyHandler,
} from "./azure-mocks.ts";
import {
	createFailedGitHubChecksHandler,
	createGitHubAlreadyReviewedHandler,
	createGitHubExistingRefusalHandler,
	createInProgressGitHubChecksHandlers,
	createOversizedGitHubPullHandlers,
} from "./github-mocks.ts";
import { mockServer, resetHostMocks } from "./mock-server.ts";
import { scenarioToken, setupReviewCliHarness } from "./review-cli-harness.ts";
import { invokeMainCli } from "./scenario.ts";

const repo = setupReviewCliHarness();

it("Review CLI returns typed errors for invalid-target, too-large, already-reviewed, and refused (with idempotent refusal)", async () => {
	const invalid = await invokeMainCli(
		["prepare", "invalid-target", repo.workdirFor("err-invalid").toString()],
		PrepareResponseSchema,
	);
	assert.equal(invalid.payload.success, false);
	assert.equal(invalid.payload.error.kind, "invalid-target");

	const tooLarge = await invokeMainCli(
		["prepare", repo.gitLargeTarget, repo.workdirFor("err-large").toString()],
		PrepareResponseSchema,
	);
	assert.equal(tooLarge.payload.success, false);
	assert.equal(tooLarge.payload.error.kind, "too-large");
	assert.deepEqual(
		(
			tooLarge.payload.error as Extract<
				typeof tooLarge.payload.error,
				{ kind: "too-large" }
			>
		).files,
		["large-prod.ts"],
	);

	const tooLargeDiff = await invokeMainCli(
		[
			"prepare",
			repo.gitLargeDiffTarget,
			repo.workdirFor("err-large-diff").toString(),
		],
		PrepareResponseSchema,
	);
	assert.equal(tooLargeDiff.payload.success, false);
	assert.equal(tooLargeDiff.payload.error.kind, "too-large");
	const diffError = tooLargeDiff.payload.error as Extract<
		typeof tooLargeDiff.payload.error,
		{ kind: "too-large" }
	>;
	assert.deepEqual(diffError.files, ["part-a.ts", "part-b.ts", "part-c.ts"]);
	assert.equal(diffError.location.includes(DIFF_LIMIT_EXCEEDED), true);

	const remoteErrorCases = [
		{
			label: "gh-already",
			target: repo.githubTarget,
			handlers: [createGitHubAlreadyReviewedHandler(repo.headCommit)],
			expectedKind: "already-reviewed" as const,
		},
		{
			label: "az-already",
			target: repo.azureTarget,
			handlers: [createAzureAlreadyReviewedHandler(repo.headCommit)],
			expectedKind: "already-reviewed" as const,
		},
		{
			label: "gh-refused",
			target: repo.githubTarget,
			handlers: [
				createFailedGitHubChecksHandler("ci"),
				createGitHubExistingRefusalHandler(repo.headCommit),
			],
			expectedKind: "refused" as const,
		},
		{
			label: "az-refused",
			target: repo.azureTarget,
			handlers: [
				createRejectedAzurePolicyHandler(),
				createAzureExistingRefusalHandler(repo.headCommit),
			],
			expectedKind: "refused" as const,
		},
	] as const;

	for (const errorCase of remoteErrorCases) {
		mockServer.use(...errorCase.handlers);
		const response = await invokeMainCli(
			[
				"prepare",
				errorCase.target,
				repo.workdirFor(`err-${errorCase.label}`).toString(),
				scenarioToken,
			],
			PrepareResponseSchema,
		);
		assert.equal(response.payload.success, false);
		assert.equal(response.payload.error.kind, errorCase.expectedKind);
	}

	resetHostMocks(repo);
	const postedRefusals: string[] = [];
	mockServer.use(
		...createInProgressGitHubChecksHandlers("check", postedRefusals),
	);
	const ghInProgressRefused = await invokeMainCli(
		[
			"prepare",
			repo.githubTarget,
			repo.workdirFor("err-gh-in-progress").toString(),
		],
		PrepareResponseSchema,
	);
	assert.equal(ghInProgressRefused.payload.success, false);
	assert.deepEqual(ghInProgressRefused.payload.error, {
		kind: "refused",
		headCommit: repo.headCommit,
		reason: "check check did not succeed",
		location:
			"https://github.com/octocat/hello-world/pull/42#pullrequestreview-99",
	});
	assert.equal(postedRefusals.length, 1);
	assert.equal(nonnull(postedRefusals[0]).startsWith("REQUEST_CHANGES:"), true);
	assert.equal(
		nonnull(postedRefusals[0]).includes("check check did not succeed"),
		true,
	);

	resetHostMocks(repo);
	mockServer.use(...createOversizedGitHubPullHandlers(repo));
	const ghTooLarge = await invokeMainCli(
		[
			"prepare",
			repo.githubTarget,
			repo.workdirFor("err-gh-too-large").toString(),
			scenarioToken,
		],
		PrepareResponseSchema,
	);
	assert.equal(ghTooLarge.payload.success, false);
	assert.equal(ghTooLarge.payload.error.kind, "too-large");
	assert.deepEqual(
		(
			ghTooLarge.payload.error as Extract<
				typeof ghTooLarge.payload.error,
				{ kind: "too-large" }
			>
		).files,
		["src/huge.ts"],
	);
});
