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
import { DIFF_LIMIT_EXCEEDED } from "../domain/limits.ts";
import { nonnull } from "../domain/nullish.ts";
import {
	AZURE_REVIEWER_ID,
	type AzureOutcomeRecorder,
	createAzureAlreadyReviewedHandler,
	createAzureExistingRefusalHandler,
	createAzureOutcomeRecorderHandlers,
	createRejectedAzurePolicyHandler,
} from "./azure-mocks.ts";
import {
	type AzureReReviewRecorder,
	createAzureReReviewHandlers,
} from "./azure-rereview-mocks.ts";
import {
	createFailedGitHubChecksHandler,
	createGitHubAlreadyReviewedHandler,
	createGitHubExistingRefusalHandler,
	createGitHubReviewRecorderHandler,
	createInProgressGitHubChecksHandlers,
	createOversizedGitHubPullHandlers,
	type GitHubReviewRecord,
} from "./github-mocks.ts";
import {
	createGitHubReReviewHandlers,
	type GitHubReReviewRecorder,
} from "./github-rereview-mocks.ts";
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
	reportForProbe,
	reportForReReviewProbe,
	runScenario,
} from "./scenario.ts";
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

it("Review CLI handles re-review with narrowed surface, GraphQL pagination, thread settle/reopen, and closing stale Azure refusals", async () => {
	const ghRecorder: GitHubReReviewRecorder = {
		settledThreadIds: [],
		reopenedThreadIds: [],
		postedBodies: [],
	};
	const azRecorder: AzureReReviewRecorder = {
		patchedThreads: [],
		createdThreads: [],
	};
	mockServer.use(
		...createGitHubReReviewHandlers(repo, ghRecorder),
		...createAzureReReviewHandlers(repo, azRecorder),
	);
	const reReviewAdapters = [
		{
			label: "rereview-github",
			target: repo.githubTarget,
			expectedThreads: 2,
			verify: () => {
				assert.deepEqual(ghRecorder.settledThreadIds, ["T_open_fixed"]);
				assert.deepEqual(ghRecorder.reopenedThreadIds, [
					"T_resolved_recurring",
				]);
				assert.equal(ghRecorder.postedBodies.length, 1);
			},
		},
		{
			label: "rereview-azure",
			target: repo.azureTarget,
			expectedThreads: 2,
			verify: () => {
				assert.deepEqual(azRecorder.patchedThreads[0], {
					id: "90",
					status: "closed",
				});
				assert.deepEqual(
					[...azRecorder.patchedThreads.slice(1)].sort((a, b) =>
						a.id.localeCompare(b.id),
					),
					[
						{ id: "10", status: "closed" },
						{ id: "11", status: "active" },
					],
				);
			},
		},
	] as const;

	for (const adapter of reReviewAdapters) {
		const workdir = repo.workdirFor(adapter.label);
		const prep = await invokeMainCli(
			["prepare", adapter.target, workdir.toString(), TOKEN_STRING],
			PrepareResponseSchema,
		);
		assert.equal(prep.exitCode, 0);
		assert.equal(prep.payload.success, true);
		assert.equal("headCommit" in prep.payload, false);
		assert.equal("change" in prep.payload, false);
		assert.equal(
			workdir.ledgerDirectory().readPullRequest().surface.headCommit,
			repo.headCommitV2,
		);
		assert.equal(
			workdir.ledgerDirectory().readPullRequest().threads.threads.length,
			adapter.expectedThreads,
		);
		const ready = PrepareReadySchema.parse(prep.payload);
		const inspected = await Promise.all(
			ready.pending.map((probeName) =>
				reportForReReviewProbe(ready.session, probeName),
			),
		);
		for (const entry of inspected) {
			assert.equal(entry.change.description, "Re-review body");
			assert.equal(entry.instructions.length, 9);
			assert.equal("checkout" in entry, entry.kind !== "rules");
		}
		const dispatch = await invokeMainCli(
			["dispatch", workdir.toString(), TOKEN_STRING],
			DispatchResultSchema,
		);
		assert.equal(dispatch.exitCode, 0);
		assert.equal(dispatch.payload.kind, "submitted");
		adapter.verify();
	}
});

it("Review CLI reports pending probes on partial completion and submits once remaining probes report", async () => {
	const workdir = repo.workdirFor("scenario-retry");
	const prepared = await invokeMainCli(
		["prepare", repo.gitTarget, workdir.toString()],
		PrepareResponseSchema,
	);
	assert.equal(prepared.exitCode, 0);
	assert.equal(prepared.payload.success, true);

	const contextProbes = prepared.payload.pending.filter((name) =>
		name.endsWith("-context"),
	);
	const rulebookProbes = prepared.payload.pending.filter(
		(name) => !name.endsWith("-context"),
	);
	for (const probeName of rulebookProbes) {
		await reportForProbe(prepared.payload.session, probeName);
	}

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

	for (const probeName of contextProbes) {
		await reportForProbe(prepared.payload.session, probeName);
	}

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
	assert.deepEqual(secondStatus.payload.completed, [
		...prepared.payload.pending,
	]);
});

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
				TOKEN_STRING,
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
			TOKEN_STRING,
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

it("Review CLI short-circuits oversized GitHub PRs without requesting check-runs, GraphQL, or zipballs, while preserving already-reviewed", async () => {
	const seenPaths: string[] = [];
	const onRequest = ({ request }: { readonly request: Request }) => {
		seenPaths.push(new URL(request.url).pathname);
	};
	mockServer.events.on("request:start", onRequest);
	try {
		resetHostMocks(repo);
		mockServer.use(...createOversizedGitHubPullHandlers(repo));
		const oversized = await invokeMainCli(
			[
				"prepare",
				repo.githubTarget,
				repo.workdirFor("shortcircuit-too-large").toString(),
				TOKEN_STRING,
			],
			PrepareResponseSchema,
		);
		assert.equal(oversized.payload.success, false);
		assert.equal(oversized.payload.error.kind, "too-large");
		assert.equal(
			seenPaths.some((path) => path.includes("/check-runs")),
			false,
		);
		assert.equal(
			seenPaths.some((path) => path.includes("/graphql")),
			false,
		);
		assert.equal(
			seenPaths.some((path) => path.includes("/zipball/")),
			false,
		);

		seenPaths.length = 0;
		mockServer.use(createGitHubAlreadyReviewedHandler(repo.headCommit));
		const alreadyReviewed = await invokeMainCli(
			[
				"prepare",
				repo.githubTarget,
				repo.workdirFor("shortcircuit-already-reviewed").toString(),
				TOKEN_STRING,
			],
			PrepareResponseSchema,
		);
		assert.equal(alreadyReviewed.payload.success, false);
		assert.equal(alreadyReviewed.payload.error.kind, "already-reviewed");
		assert.equal(
			seenPaths.some((path) => path.includes("/check-runs")),
			false,
		);
		assert.equal(
			seenPaths.some((path) => path.includes("/graphql")),
			false,
		);
		assert.equal(
			seenPaths.some((path) => path.includes("/zipball/")),
			false,
		);
	} finally {
		mockServer.events.removeListener("request:start", onRequest);
		resetHostMocks(repo);
	}
});
