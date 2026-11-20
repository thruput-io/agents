import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { after, before, beforeEach, test as it } from "node:test";
import {
	PrepareReadySchema,
	PrepareResponseSchema,
	ReviewStatusSchema,
} from "../domain/contracts.g.ts";
import { nonnull } from "../domain/nullish.ts";
import {
	type AzureReReviewRecorder,
	createAzureReReviewHandlers,
} from "./azure-rereview-mocks.ts";
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
import { reportForReReviewProbe } from "./scenario.ts";
import {
	cleanupReviewToolForTest,
	installReviewToolForTest,
	invokeMainCli,
} from "./scenario-cli.ts";
import { createScenarioRepo } from "./scenario-repo.ts";

const repo = createScenarioRepo();
const TOKEN_STRING = scenarioToken;
const EXPECTED_THREAD_COUNT = 2;

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

const runReReviewFlow = async (label: string, target: string) => {
	const workdir = repo.workdirFor(label);
	const prep = await invokeMainCli(
		["prepare", target, workdir.toString(), TOKEN_STRING],
		PrepareResponseSchema,
	);
	const ready = PrepareReadySchema.parse(prep.payload);
	const initial = await Promise.all(
		ready.pending
			.slice(0, -1)
			.map((probeName) => reportForReReviewProbe(ready.session, probeName)),
	);
	const last = await reportForReReviewProbe(
		ready.session,
		nonnull(ready.pending.at(-1)),
	);
	const probeRuns = [...initial, last];
	const status = await invokeMainCli(
		["status", workdir.toString()],
		ReviewStatusSchema,
	);
	return { workdir, prep, probeRuns, status };
};

it("Review CLI handles GitHub re-review with narrowed surface, GraphQL pagination, and thread settle/reopen", async () => {
	const ghRecorder: GitHubReReviewRecorder = {
		settledThreadIds: [],
		reopenedThreadIds: [],
		postedBodies: [],
	};
	mockServer.use(...createGitHubReReviewHandlers(repo, ghRecorder));
	const { workdir, prep, probeRuns, status } = await runReReviewFlow(
		"rereview-github",
		repo.githubTarget,
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
		EXPECTED_THREAD_COUNT,
	);
	assert.deepEqual(
		probeRuns.map((entry) => ({
			description: nonnull(nonnull(entry.pages[0]).change).description,
			hasAckPrompt: entry.inspected.instructions.includes(
				"ack <session> <probe>",
			),
			hasCheckout: "checkout" in entry.inspected,
		})),
		probeRuns.map((entry) => ({
			description: "Re-review body",
			hasAckPrompt: true,
			hasCheckout: entry.inspected.permissions.length > 1,
		})),
	);
	assert.equal(status.exitCode, 0);
	assert.equal(status.payload.submittedOutcome?.verdict, "request-changes");
	assert.equal(
		status.payload.location?.startsWith("https://github.com/"),
		true,
	);
	assert.deepEqual(ghRecorder.settledThreadIds, ["T_open_fixed"]);
	assert.deepEqual(ghRecorder.reopenedThreadIds, ["T_resolved_recurring"]);
	assert.equal(ghRecorder.postedBodies.length, 1);
});

it("Review CLI handles Azure re-review with narrowed surface, thread updates, and closing stale refusals", async () => {
	const azRecorder: AzureReReviewRecorder = {
		patchedThreads: [],
		createdThreads: [],
	};
	mockServer.use(...createAzureReReviewHandlers(repo, azRecorder));
	const { workdir, prep, probeRuns, status } = await runReReviewFlow(
		"rereview-azure",
		repo.azureTarget,
	);
	assert.equal(prep.exitCode, 0);
	assert.equal(prep.payload.success, true);
	assert.equal(
		workdir.ledgerDirectory().readPullRequest().surface.headCommit,
		repo.headCommitV2,
	);
	assert.equal(
		workdir.ledgerDirectory().readPullRequest().threads.threads.length,
		EXPECTED_THREAD_COUNT,
	);
	assert.deepEqual(
		probeRuns.map((entry) => ({
			description: nonnull(nonnull(entry.pages[0]).change).description,
			hasAckPrompt: entry.inspected.instructions.includes(
				"ack <session> <probe>",
			),
		})),
		probeRuns.map(() => ({
			description: "Re-review body",
			hasAckPrompt: true,
		})),
	);
	assert.equal(status.exitCode, 0);
	assert.equal(status.payload.submittedOutcome?.verdict, "request-changes");
	assert.equal(status.payload.location, "201");
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
});
