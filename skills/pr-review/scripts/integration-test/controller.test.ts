import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, test as it } from "node:test";
import { type HostError, HostErrorSchema } from "../domain/contracts.g.ts";
import type { DispatchResult, PrepareError } from "../domain/controller.ts";
import { nonnull } from "../domain/nullish.ts";
import {
	createAzureAlreadyReviewedHandler,
	createAzureExistingRefusalHandler,
	createFailedAzureThreadCreateHandler,
	createForbiddenAzureItemsHandler,
	createForbiddenAzureWriteHandler,
	createForbiddenHtmlAzureHandler,
	createRejectedAzurePolicyHandler,
	createUnwriteableAzurePullRequestHandler,
} from "./azure-mocks.ts";
import {
	type AzureReReviewRecorder,
	createAzureReReviewHandlers,
} from "./azure-rereview-mocks.ts";
import {
	createFailedGitHubChecksHandler,
	createFailedGitHubCreateReviewHandler,
	createForbiddenGitHubGraphQlHandler,
	createForbiddenGitHubZipballHandler,
	createForbiddenHtmlGitHubHandler,
	createGitHubAlreadyReviewedHandler,
	createGitHubExistingRefusalHandler,
	createInProgressGitHubChecksHandlers,
	createReadOnlyOAuthScopesGitHubHandler,
	createReadOnlyViewerGitHubGraphQlHandler,
} from "./github-mocks.ts";
import {
	createGitHubReReviewHandlers,
	type GitHubReReviewRecorder,
} from "./github-rereview-mocks.ts";
import { mockServer, resetHostMocks, scenarioToken } from "./mock-server.ts";
import {
	invokeMainCli,
	type PreparedCliPayload,
	reportForProbe,
	reportForReReviewProbe,
	runScenario,
	type StatusCliPayload,
} from "./scenario.ts";
import { createScenarioRepo } from "./scenario-repo.ts";

const repo = createScenarioRepo();
const TOKEN_STRING = scenarioToken;

const decodeHostError = (error: PrepareError | DispatchResult): HostError => {
	if (error.kind !== "host-error") {
		throw new Error(`Expected host-error, got ${error.kind}`);
	}
	return HostErrorSchema.decode(error);
};

before(() => {
	mockServer.listen();
});

beforeEach(() => {
	resetHostMocks(repo);
});

after(() => {
	mockServer.close();
	rmSync(repo.rootDir, { recursive: true, force: true });
});

it("MainAgentController CLI prepares merge-base surface, preserves trailing blank lines, skips 0-hunk files, and posts identical outcomes across Git, GitHub, and AzureDevOps", async () => {
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
	assert.equal(
		gitRun.prepared.prompts[nonnull(gitRun.invoked[0])]?.includes(
			nonnull(gitRun.invoked[0]),
		),
		true,
	);
	assert.deepEqual(gitRun.prepared.permissions[nonnull(gitRun.invoked[0])], [
		"Bash(node *sub-agent-controller.ts*)",
	]);

	const surfacePaths = firstInspected.surface.files.map((f) => f.path);
	assert.deepEqual(surfacePaths, ["helper.ts", "service.ts"]);

	assert.equal("checkout" in firstInspected, false);
	for (const entry of gitRun.inspected) {
		assert.equal(
			"checkout" in entry,
			entry.kind === "reuse" || entry.kind === "dead-code",
		);
	}
	for (const label of ["scenario-git", "scenario-github", "scenario-azure"]) {
		const dir = repo.workdirFor(label).snapshotDirectory().toString();
		assert.equal(
			readFileSync(join(dir, "helper.ts"), "utf8"),
			"export const z = 3;\n\n",
		);
	}
	assert.equal(
		existsSync(
			join(
				repo.workdirFor("scenario-git").toString(),
				"instructions",
				`${nonnull(gitRun.invoked[0])}.json`,
			),
		),
		true,
	);
	assert.equal(
		existsSync(
			join(
				repo.workdirFor("scenario-git").ledgerDirectory().toString(),
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

it("MainAgentController CLI handles re-review with narrowed surface, GraphQL pagination, thread settle/reopen, and closing stale Azure refusals", async () => {
	const ghRecorder: GitHubReReviewRecorder = {
		settledThreadIds: [],
		reopenedThreadIds: [],
		postedBodies: [],
	};
	mockServer.use(...createGitHubReReviewHandlers(repo, ghRecorder));
	const ghWorkdir = repo.workdirFor("rereview-github");
	const ghPrep = await invokeMainCli<PreparedCliPayload>([
		"prepare",
		repo.githubTarget,
		ghWorkdir.toString(),
		TOKEN_STRING,
	]);
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
		assert.equal(inspected.instructions.length, 8);
		assert.equal(
			"checkout" in inspected,
			inspected.kind === "reuse" || inspected.kind === "dead-code",
		);
	}

	const ghDispatch = await invokeMainCli<DispatchResult>([
		"dispatch",
		ghWorkdir.toString(),
		TOKEN_STRING,
	]);
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
	const azPrep = await invokeMainCli<PreparedCliPayload>([
		"prepare",
		repo.azureTarget,
		azWorkdir.toString(),
		TOKEN_STRING,
	]);
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
	const azDispatch = await invokeMainCli<DispatchResult>([
		"dispatch",
		azWorkdir.toString(),
		TOKEN_STRING,
	]);
	assert.equal(azDispatch.exitCode, 0);
	assert.equal(azDispatch.payload.kind, "submitted");
	assert.deepEqual(azRecorder.patchedThreads, [
		{ id: "90", status: "closed" },
		{ id: "10", status: "closed" },
		{ id: "11", status: "active" },
	]);
});

it("MainAgentController CLI reports pending probes on partial completion and submits once remaining probes report", async () => {
	const workdir = repo.workdirFor("scenario-retry");
	const prepared = await invokeMainCli<PreparedCliPayload>([
		"prepare",
		repo.gitTarget,
		workdir.toString(),
	]);
	assert.equal(prepared.exitCode, 0);
	assert.equal(prepared.payload.success, true);

	const contextProbes: string[] = [];
	for (const probeName of prepared.payload.pending) {
		if (probeName.endsWith("-context")) {
			contextProbes.push(probeName);
		} else {
			await reportForProbe(prepared.payload.session, probeName);
		}
	}

	const firstDispatch = await invokeMainCli<DispatchResult>([
		"dispatch",
		workdir.toString(),
	]);
	assert.equal(firstDispatch.exitCode, 0);
	assert.equal(firstDispatch.payload.kind, "pending");
	assert.deepEqual(firstDispatch.payload.remaining, contextProbes);

	const firstStatus = await invokeMainCli<StatusCliPayload>([
		"status",
		workdir.toString(),
	]);
	assert.equal(firstStatus.exitCode, 0);
	assert.deepEqual(firstStatus.payload.pending, contextProbes);
	assert.equal(firstStatus.payload.submittedOutcome, null);

	for (const probeName of contextProbes) {
		await reportForProbe(prepared.payload.session, probeName);
	}

	const secondDispatch = await invokeMainCli<DispatchResult>([
		"dispatch",
		workdir.toString(),
	]);
	assert.equal(secondDispatch.exitCode, 0);
	assert.equal(secondDispatch.payload.kind, "submitted");

	const secondStatus = await invokeMainCli<StatusCliPayload>([
		"status",
		workdir.toString(),
	]);
	assert.equal(secondStatus.exitCode, 0);
	assert.deepEqual(secondStatus.payload.pending, []);
	assert.equal(
		secondStatus.payload.submittedOutcome?.verdict,
		"request-changes",
	);
});

it("MainAgentController CLI returns typed errors for invalid-target, too-large, already-reviewed, and refused (with idempotent refusal)", async () => {
	const invalid = await invokeMainCli<PreparedCliPayload>([
		"prepare",
		"invalid-target",
		repo.workdirFor("err-invalid").toString(),
	]);
	assert.equal(invalid.payload.success, false);
	assert.equal(invalid.payload.error.kind, "invalid-target");

	const tooLarge = await invokeMainCli<PreparedCliPayload>([
		"prepare",
		repo.gitLargeTarget,
		repo.workdirFor("err-large").toString(),
	]);
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

	const tooLargeDiff = await invokeMainCli<PreparedCliPayload>([
		"prepare",
		repo.gitLargeDiffTarget,
		repo.workdirFor("err-large-diff").toString(),
	]);
	assert.equal(tooLargeDiff.payload.success, false);
	assert.equal(tooLargeDiff.payload.error.kind, "too-large");
	const diffError = tooLargeDiff.payload.error as Extract<
		typeof tooLargeDiff.payload.error,
		{ kind: "too-large" }
	>;
	assert.deepEqual(diffError.files, ["part-a.ts", "part-b.ts", "part-c.ts"]);
	assert.equal(
		diffError.location.includes(
			"pull request is too large. It cannot be kept focused and reviewable as required, and commenting on it would start an endless loop",
		),
		true,
	);

	mockServer.use(createGitHubAlreadyReviewedHandler(repo.headCommit));
	const ghAlready = await invokeMainCli<PreparedCliPayload>([
		"prepare",
		repo.githubTarget,
		repo.workdirFor("err-gh-already").toString(),
		TOKEN_STRING,
	]);
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
	const azAlready = await invokeMainCli<PreparedCliPayload>([
		"prepare",
		repo.azureTarget,
		repo.workdirFor("err-az-already").toString(),
		TOKEN_STRING,
	]);
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
	const ghRefused = await invokeMainCli<PreparedCliPayload>([
		"prepare",
		repo.githubTarget,
		repo.workdirFor("err-gh-refused").toString(),
		TOKEN_STRING,
	]);
	assert.equal(ghRefused.payload.success, false);
	assert.equal(ghRefused.payload.error.kind, "refused");

	mockServer.use(
		createRejectedAzurePolicyHandler(),
		createAzureExistingRefusalHandler(repo.headCommit),
	);
	const azRefused = await invokeMainCli<PreparedCliPayload>([
		"prepare",
		repo.azureTarget,
		repo.workdirFor("err-az-refused").toString(),
		TOKEN_STRING,
	]);
	assert.equal(azRefused.payload.success, false);
	assert.equal(azRefused.payload.error.kind, "refused");

	resetHostMocks(repo);
	const postedRefusals: string[] = [];
	mockServer.use(
		...createInProgressGitHubChecksHandlers("check", postedRefusals),
	);
	const ghInProgressRefused = await invokeMainCli<PreparedCliPayload>([
		"prepare",
		repo.githubTarget,
		repo.workdirFor("err-gh-in-progress").toString(),
	]);
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

	mockServer.use(
		createForbiddenHtmlAzureHandler(),
		createForbiddenHtmlGitHubHandler(),
	);
	const azHtml403 = await invokeMainCli<PreparedCliPayload>([
		"prepare",
		repo.azureTarget,
		repo.workdirFor("err-az-403-html").toString(),
		TOKEN_STRING,
	]);
	assert.equal(azHtml403.payload.success, false);
	const azHostError = decodeHostError(azHtml403.payload.error);
	assert.equal(azHostError.status, 403);
	assert.equal(azHostError.message.includes("access denied"), true);
	assert.equal(
		azHostError.reason.includes("Azure DevOps returned HTTP 403"),
		true,
	);

	const ghHtml403 = await invokeMainCli<PreparedCliPayload>([
		"prepare",
		repo.githubTarget,
		repo.workdirFor("err-gh-403-html").toString(),
	]);
	assert.equal(ghHtml403.payload.success, false);
	const ghHostError = decodeHostError(ghHtml403.payload.error);
	assert.equal(ghHostError.status, 403);
	assert.equal(ghHostError.message.includes("access denied"), true);
	assert.equal(ghHostError.reason.includes("GitHub returned HTTP 403"), true);

	resetHostMocks(repo);
	mockServer.use(createReadOnlyOAuthScopesGitHubHandler(repo));
	const ghMissingScope = await invokeMainCli<PreparedCliPayload>([
		"prepare",
		repo.githubTarget,
		repo.workdirFor("err-gh-missing-scope").toString(),
		TOKEN_STRING,
	]);
	assert.equal(ghMissingScope.payload.success, false);
	const ghMissingScopeErr = decodeHostError(ghMissingScope.payload.error);
	assert.equal(ghMissingScopeErr.status, 403);

	resetHostMocks(repo);
	mockServer.use(createReadOnlyViewerGitHubGraphQlHandler());
	const ghReadOnlyViewer = await invokeMainCli<PreparedCliPayload>([
		"prepare",
		repo.githubTarget,
		repo.workdirFor("err-gh-readonly-viewer").toString(),
		TOKEN_STRING,
	]);
	assert.equal(ghReadOnlyViewer.payload.success, false);
	const ghReadOnlyViewerErr = decodeHostError(ghReadOnlyViewer.payload.error);
	assert.equal(ghReadOnlyViewerErr.status, 403);

	resetHostMocks(repo);
	mockServer.use(createForbiddenGitHubGraphQlHandler());
	const ghGraphQl403 = await invokeMainCli<PreparedCliPayload>([
		"prepare",
		repo.githubTarget,
		repo.workdirFor("err-gh-graphql-403").toString(),
	]);
	assert.equal(ghGraphQl403.payload.success, false);
	const ghGraphQlErr = decodeHostError(ghGraphQl403.payload.error);
	assert.equal(ghGraphQlErr.status, 403);
	assert.equal(ghGraphQlErr.message, "Resource not accessible by integration");
	assert.equal(
		ghGraphQlErr.reason.includes("Resource not accessible by integration"),
		true,
	);

	resetHostMocks(repo);
	mockServer.use(createForbiddenGitHubZipballHandler());
	const ghZip403 = await invokeMainCli<PreparedCliPayload>([
		"prepare",
		repo.githubTarget,
		repo.workdirFor("err-gh-zip-403").toString(),
		TOKEN_STRING,
	]);
	assert.equal(ghZip403.payload.success, false);
	const ghZipErr = decodeHostError(ghZip403.payload.error);
	assert.equal(ghZipErr.status, 403);
	assert.equal(ghZipErr.message, "Repository archive access denied");

	resetHostMocks(repo);
	mockServer.use(createForbiddenAzureItemsHandler());
	const azZip403 = await invokeMainCli<PreparedCliPayload>([
		"prepare",
		repo.azureTarget,
		repo.workdirFor("err-az-zip-403").toString(),
		TOKEN_STRING,
	]);
	assert.equal(azZip403.payload.success, false);
	const azZipErr = decodeHostError(azZip403.payload.error);
	assert.equal(azZipErr.status, 403);
	assert.equal(
		azZipErr.message,
		"TF401019: The Git repository with name or identifier does not exist or you do not have permissions.",
	);

	resetHostMocks(repo);
	const readOnlyJwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ scp: "vso.code" }), "utf8").toString("base64url")}.sig`;
	const azMissingJwtScope = await invokeMainCli<PreparedCliPayload>([
		"prepare",
		repo.azureTarget,
		repo.workdirFor("err-az-missing-jwt-scope").toString(),
		readOnlyJwt,
	]);
	assert.equal(azMissingJwtScope.payload.success, false);
	const azMissingJwtErr = decodeHostError(azMissingJwtScope.payload.error);
	assert.equal(azMissingJwtErr.status, 403);

	resetHostMocks(repo);
	mockServer.use(createForbiddenAzureWriteHandler());
	const azReadOnlyPat = await invokeMainCli<PreparedCliPayload>([
		"prepare",
		repo.azureTarget,
		repo.workdirFor("err-az-readonly-pat").toString(),
		TOKEN_STRING,
	]);
	assert.equal(azReadOnlyPat.payload.success, false);
	const azReadOnlyPatErr = decodeHostError(azReadOnlyPat.payload.error);
	assert.equal(azReadOnlyPatErr.status, 403);
	assert.equal(
		azReadOnlyPatErr.message,
		"TF401027: You need the Git 'PullRequestContribute' permission.",
	);
	assert.equal(
		azReadOnlyPatErr.reason.includes(
			"TF401027: You need the Git 'PullRequestContribute' permission.",
		),
		true,
	);

	resetHostMocks(repo);
	mockServer.use(createUnwriteableAzurePullRequestHandler());
	const azUnwriteablePr = await invokeMainCli<PreparedCliPayload>([
		"prepare",
		repo.azureTarget,
		repo.workdirFor("err-az-unwriteable-pr").toString(),
		TOKEN_STRING,
	]);
	assert.equal(azUnwriteablePr.payload.success, false);
	const azUnwriteableError = decodeHostError(azUnwriteablePr.payload.error);
	assert.equal(azUnwriteableError.status, 400);
	assert.equal(
		azUnwriteableError.message,
		"TF401181: The pull request cannot be edited due to its state.",
	);
	assert.equal(
		azUnwriteableError.reason.includes("pull request is not writeable"),
		true,
	);
	assert.equal(
		azUnwriteableError.reason.includes(
			"TF401181: The pull request cannot be edited due to its state.",
		),
		true,
	);
	assert.equal(azUnwriteableError.reason.includes("Review must halt."), true);

	resetHostMocks(repo);
	const azDispatchFailWorkdir = repo.workdirFor("err-az-dispatch-400");
	const azDispatchPrep = await invokeMainCli<PreparedCliPayload>([
		"prepare",
		repo.azureTarget,
		azDispatchFailWorkdir.toString(),
		TOKEN_STRING,
	]);
	assert.equal(azDispatchPrep.payload.success, true);
	for (const probeName of azDispatchPrep.payload.pending) {
		await reportForProbe(azDispatchPrep.payload.session, probeName);
	}
	mockServer.use(createFailedAzureThreadCreateHandler());
	const azDispatchErr = await invokeMainCli<DispatchResult>([
		"dispatch",
		azDispatchFailWorkdir.toString(),
		TOKEN_STRING,
	]);
	const decodedAzDispatchErr = decodeHostError(azDispatchErr.payload);
	assert.equal(decodedAzDispatchErr.status, 400);
	assert.equal(
		decodedAzDispatchErr.message,
		"TF401181: The pull request cannot be edited due to its state.",
	);

	resetHostMocks(repo);
	const ghDispatchFailWorkdir = repo.workdirFor("err-gh-dispatch-422");
	const ghDispatchPrep = await invokeMainCli<PreparedCliPayload>([
		"prepare",
		repo.githubTarget,
		ghDispatchFailWorkdir.toString(),
		TOKEN_STRING,
	]);
	assert.equal(ghDispatchPrep.payload.success, true);
	for (const probeName of ghDispatchPrep.payload.pending) {
		await reportForProbe(ghDispatchPrep.payload.session, probeName);
	}
	mockServer.use(createFailedGitHubCreateReviewHandler());
	const ghDispatchErr = await invokeMainCli<DispatchResult>([
		"dispatch",
		ghDispatchFailWorkdir.toString(),
		TOKEN_STRING,
	]);
	const decodedGhDispatchErr = decodeHostError(ghDispatchErr.payload);
	assert.equal(decodedGhDispatchErr.status, 422);
	assert.equal(
		decodedGhDispatchErr.message,
		"Validation Failed: PullRequestReview can only have one pending review per pull request",
	);
});

it("MainAgentController CLI reads GH_TOKEN and AZURE_DEVOPS_EXT_PAT from process.env, formats headers per host, and sends accept: application/json", async () => {
	const seenHeaders: Array<{
		readonly host: string;
		readonly pathname: string;
		readonly auth: string | null;
		readonly accept: string | null;
	}> = [];
	const onRequest = ({ request }: { readonly request: Request }) => {
		const url = new URL(request.url);
		seenHeaders.push({
			host: url.host,
			pathname: url.pathname,
			auth: request.headers.get("authorization"),
			accept: request.headers.get("accept"),
		});
	};
	mockServer.events.on("request:start", onRequest);
	try {
		Object.assign(process.env, {
			GH_TOKEN: "env-gh-token",
			AZURE_DEVOPS_EXT_PAT: "env-az-pat",
		});
		const ghWithToken = await invokeMainCli<PreparedCliPayload>([
			"prepare",
			repo.githubTarget,
			repo.workdirFor("env-gh-set").toString(),
		]);
		assert.equal(ghWithToken.payload.success, true);
		const azWithToken = await invokeMainCli<PreparedCliPayload>([
			"prepare",
			repo.azureTarget,
			repo.workdirFor("env-az-set").toString(),
		]);
		assert.equal(azWithToken.payload.success, true);

		const expectedAzAuth = `Basic ${Buffer.from(":env-az-pat", "utf8").toString("base64")}`;
		const ghRequests = seenHeaders.filter(
			(entry) => entry.host === "api.github.com",
		);
		const azRequests = seenHeaders.filter(
			(entry) => entry.host === "dev.azure.com",
		);
		assert.equal(
			ghRequests.some((entry) => entry.pathname.includes("/zipball/")),
			true,
		);
		assert.equal(
			azRequests.some((entry) => entry.pathname.endsWith("/items")),
			true,
		);
		assert.equal(
			ghRequests.every(
				(entry) =>
					entry.auth === "Bearer env-gh-token" &&
					entry.accept === "application/json",
			),
			true,
		);
		assert.equal(
			azRequests.every(
				(entry) =>
					entry.auth === expectedAzAuth && entry.accept === "application/json",
			),
			true,
		);

		seenHeaders.length = 0;
		Object.assign(process.env, {
			GH_TOKEN: "",
			AZURE_DEVOPS_EXT_PAT: "",
		});
		const ghWithoutToken = await invokeMainCli<PreparedCliPayload>([
			"prepare",
			repo.githubTarget,
			repo.workdirFor("env-gh-empty").toString(),
		]);
		assert.equal(ghWithoutToken.payload.success, true);
		const azWithoutToken = await invokeMainCli<PreparedCliPayload>([
			"prepare",
			repo.azureTarget,
			repo.workdirFor("env-az-empty").toString(),
		]);
		assert.equal(azWithoutToken.payload.success, true);
		assert.equal(
			seenHeaders.every((entry) => entry.auth === null),
			true,
		);
		assert.equal(
			seenHeaders
				.filter((entry) => entry.host === "dev.azure.com")
				.every((entry) => entry.accept === "application/json"),
			true,
		);
	} finally {
		mockServer.events.removeListener("request:start", onRequest);
	}
});
