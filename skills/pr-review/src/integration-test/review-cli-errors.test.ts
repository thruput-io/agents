import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { after, before, beforeEach, test as it } from "node:test";
import { PrepareResponseSchema } from "../domain/contracts.g.ts";
import { DIFF_LIMIT_EXCEEDED } from "../domain/limits.ts";
import {
	createAzureExistingRefusalHandler,
	createRejectedAzurePolicyHandler,
} from "./azure-error-mocks.ts";
import { createAzureAlreadyReviewedHandler } from "./azure-mocks.ts";
import { createFailedGitHubChecksHandler } from "./github-error-mocks.ts";
import {
	createGitHubAlreadyReviewedHandler,
	createGitHubExistingRefusalHandler,
} from "./github-scenario-mocks.ts";
import {
	mockServer,
	resetHostMocks,
	scenarioToken,
	startMockBridge,
	stopMockBridge,
} from "./mock-server.ts";
import {
	cleanupReviewToolForTest,
	installReviewToolForTest,
	invokeMainCli,
} from "./scenario-cli.ts";
import { createScenarioRepo } from "./scenario-repo.ts";

const repo = createScenarioRepo();
const TOKEN_STRING = scenarioToken;

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

it("Review CLI returns invalid-target and too-large errors for oversized local Git diffs", async () => {
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
});

it("Review CLI returns already-reviewed errors for GitHub and AzureDevOps", async () => {
	mockServer.use(createGitHubAlreadyReviewedHandler(repo.headCommit));
	const ghAlready = await invokeMainCli(
		[
			"prepare",
			repo.githubTarget,
			repo.workdirFor("err-gh-already").toString(),
			TOKEN_STRING,
		],
		PrepareResponseSchema,
	);
	assert.equal(ghAlready.payload.success, false);
	assert.equal(ghAlready.payload.error.kind, "already-reviewed");

	mockServer.use(createAzureAlreadyReviewedHandler(repo.headCommit));
	const azAlready = await invokeMainCli(
		[
			"prepare",
			repo.azureTarget,
			repo.workdirFor("err-az-already").toString(),
			TOKEN_STRING,
		],
		PrepareResponseSchema,
	);
	assert.equal(azAlready.payload.success, false);
	assert.equal(azAlready.payload.error.kind, "already-reviewed");
});

it("Review CLI returns refused errors for GitHub and AzureDevOps", async () => {
	mockServer.use(
		createFailedGitHubChecksHandler("ci"),
		createGitHubExistingRefusalHandler(repo.headCommit),
	);
	const ghRefused = await invokeMainCli(
		[
			"prepare",
			repo.githubTarget,
			repo.workdirFor("err-gh-refused").toString(),
			TOKEN_STRING,
		],
		PrepareResponseSchema,
	);
	assert.equal(ghRefused.payload.success, false);
	assert.equal(ghRefused.payload.error.kind, "refused");

	mockServer.use(
		createRejectedAzurePolicyHandler(),
		createAzureExistingRefusalHandler(repo.headCommit),
	);
	const azRefused = await invokeMainCli(
		[
			"prepare",
			repo.azureTarget,
			repo.workdirFor("err-az-refused").toString(),
			TOKEN_STRING,
		],
		PrepareResponseSchema,
	);
	assert.equal(azRefused.payload.success, false);
	assert.equal(azRefused.payload.error.kind, "refused");
});
