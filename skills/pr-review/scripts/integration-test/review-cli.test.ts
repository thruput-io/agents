import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, test as it } from "node:test";
import {
	type DispatchResult,
	DispatchResultSchema,
	PrepareResponseSchema,
	ReviewStatusSchema,
} from "../domain/contracts.g.ts";
import { DIFF_LIMIT_EXCEEDED } from "../domain/limits.ts";
import { nonnull } from "../domain/nullish.ts";
import {
	createAzureAlreadyReviewedHandler,
	createAzureExistingRefusalHandler,
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
	createInProgressGitHubChecksHandlers,
	createOversizedGitHubPullHandlers,
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
	invokeMainCli,
	reportForProbe,
	reportForReReviewProbe,
	runScenario,
} from "./scenario.ts";
import { createScenarioRepo } from "./scenario-repo.ts";

const repo = createScenarioRepo();
const TOKEN_STRING = scenarioToken;

before(async () => {
	await startMockBridge();
});

beforeEach(() => {
	resetHostMocks(repo);
});

after(async () => {
	await stopMockBridge();
	rmSync(repo.rootDir, { recursive: true, force: true });
});

it("Review CLI prepares merge-base surface, preserves trailing blank lines, skips 0-hunk files, and posts identical outcomes across Git, GitHub, and AzureDevOps", async () => {
	const gitRun = await runScenario(repo, repo.gitTarget, "scenario-git");
	const githubRun = await runScenario(
		repo,
		repo.githubTarget,
		"scenario-github",
	);
	const azureRun = await runScenario(repo, repo.azureTarget, "scenario-azure");

	assert.equal(gitRun.invoked.length > 1, true);
	assert.deepEqual(githubRun.invoked, gitRun.invoked);
	assert.deepEqual(azureRun.invoked, gitRun.invoked);
	assert.equal("change" in gitRun.prepared, false);
	assert.equal("headCommit" in gitRun.prepared, false);

	const firstInspected = nonnull(gitRun.inspected[0]);
	const firstGithubInspected = nonnull(githubRun.inspected[0]);
	const firstAzureInspected = nonnull(azureRun.inspected[0]);
	assert.equal(firstInspected.change.author, "author@example.com");
	assert.equal(
		firstInspected.change.description,
		"Refine helper\n\nSecond body.\n\nAdd y export\n\nFirst body.",
	);
	assert.equal(
		firstGithubInspected.change.description,
		firstInspected.change.description,
	);
	assert.equal(
		firstAzureInspected.change.description,
		firstInspected.change.description,
	);
	assert.equal("prompts" in gitRun.prepared, false);
	assert.equal("rulesets" in gitRun.prepared, false);
	assert.deepEqual(gitRun.prepared.permissions[nonnull(gitRun.invoked[0])], [
		"Bash(node *sub-agent-controller.ts*)",
	]);

	assert.equal(firstInspected.surface.changedFiles, 2);
	const surfacePaths = gitRun.pages.map((p) => p.path);
	assert.deepEqual(surfacePaths, ["helper.ts", "service.ts"]);

	assert.equal("checkout" in firstInspected, false);
	for (const entry of gitRun.inspected) {
		assert.equal("checkout" in entry, entry.kind !== "rules");
	}
	for (const run of [gitRun, githubRun, azureRun]) {
		const dir = run.workdir.snapshotDirectory().toString();
		assert.equal(
			readFileSync(join(dir, "helper.ts"), "utf8"),
			"export const z = 3;\n\n",
		);
	}
	assert.equal(
		existsSync(
			join(
				gitRun.workdir.toString(),
				"instructions",
				`${nonnull(gitRun.invoked[0])}.json`,
			),
		),
		true,
	);
	assert.equal(
		existsSync(
			join(
				gitRun.workdir.ledgerDirectory().toString(),
				`${nonnull(gitRun.invoked[0])}.json`,
			),
		),
		true,
	);

	const gitSubmitted = gitRun.dispatched as Extract<
		DispatchResult,
		{ kind: "submitted" }
	>;
	const githubSubmitted = githubRun.dispatched as Extract<
		DispatchResult,
		{ kind: "submitted" }
	>;
	const azureSubmitted = azureRun.dispatched as Extract<
		DispatchResult,
		{ kind: "submitted" }
	>;
	assert.equal(gitSubmitted.outcome.verdict, "request-changes");
	assert.deepEqual(githubSubmitted.outcome, gitSubmitted.outcome);
	assert.deepEqual(azureSubmitted.outcome, gitSubmitted.outcome);
});

it("Review CLI handles re-review with narrowed surface, GraphQL pagination, thread settle/reopen, and closing stale Azure refusals", async () => {
	const ghRecorder: GitHubReReviewRecorder = {
		settledThreadIds: [],
		reopenedThreadIds: [],
		postedBodies: [],
	};
	mockServer.use(...createGitHubReReviewHandlers(repo, ghRecorder));
	const ghWorkdir = repo.workdirFor("rereview-github");
	const ghPrep = await invokeMainCli(
		["prepare", repo.githubTarget, ghWorkdir.toString(), TOKEN_STRING],
		PrepareResponseSchema,
	);
	assert.equal(ghPrep.exitCode, 0);
	assert.equal(ghPrep.payload.success, true);
	assert.equal("headCommit" in ghPrep.payload, false);
	assert.equal("change" in ghPrep.payload, false);
	assert.equal(
		ghWorkdir.ledgerDirectory().readPullRequest().surface.headCommit,
		repo.headCommitV2,
	);
	assert.equal(
		ghWorkdir.ledgerDirectory().readPullRequest().threads.threads.length,
		2,
	);

	for (const probeName of ghPrep.payload.pending) {
		const inspected = await reportForReReviewProbe(
			ghPrep.payload.session,
			probeName,
		);
		assert.equal(inspected.change.description, "Re-review body");
		assert.equal(inspected.instructions.length, 9);
		assert.equal("checkout" in inspected, inspected.kind !== "rules");
	}

	const ghDispatch = await invokeMainCli(
		["dispatch", ghWorkdir.toString(), TOKEN_STRING],
		DispatchResultSchema,
	);
	assert.equal(ghDispatch.exitCode, 0);
	assert.equal(ghDispatch.payload.kind, "submitted");
	assert.deepEqual(ghRecorder.settledThreadIds, ["T_open_fixed"]);
	assert.deepEqual(ghRecorder.reopenedThreadIds, ["T_resolved_recurring"]);
	assert.equal(ghRecorder.postedBodies.length, 1);

	const azRecorder: AzureReReviewRecorder = {
		patchedThreads: [],
		createdThreads: [],
	};
	mockServer.use(...createAzureReReviewHandlers(repo, azRecorder));
	const azWorkdir = repo.workdirFor("rereview-azure");
	const azPrep = await invokeMainCli(
		["prepare", repo.azureTarget, azWorkdir.toString(), TOKEN_STRING],
		PrepareResponseSchema,
	);
	assert.equal(azPrep.exitCode, 0);
	assert.equal(azPrep.payload.success, true);
	assert.equal("headCommit" in azPrep.payload, false);
	assert.equal("change" in azPrep.payload, false);
	assert.equal(
		azWorkdir.ledgerDirectory().readPullRequest().surface.headCommit,
		repo.headCommitV2,
	);
	for (const probeName of azPrep.payload.pending) {
		await reportForReReviewProbe(azPrep.payload.session, probeName);
	}
	const azDispatch = await invokeMainCli(
		["dispatch", azWorkdir.toString(), TOKEN_STRING],
		DispatchResultSchema,
	);
	assert.equal(azDispatch.exitCode, 0);
	assert.equal(azDispatch.payload.kind, "submitted");
	assert.deepEqual(azRecorder.patchedThreads, [
		{ id: "90", status: "closed" },
		{ id: "10", status: "closed" },
		{ id: "11", status: "active" },
	]);
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
	assert.equal(
		(
			ghAlready.payload.error as Extract<
				typeof ghAlready.payload.error,
				{ kind: "already-reviewed" }
			>
		).headCommit,
		repo.headCommit,
	);

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
	assert.equal(
		(
			azAlready.payload.error as Extract<
				typeof azAlready.payload.error,
				{ kind: "already-reviewed" }
			>
		).headCommit,
		repo.headCommit,
	);

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
