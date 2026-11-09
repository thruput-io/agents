import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, test as it } from "node:test";
import {
	type DispatchResult,
	MainAgentController,
} from "../domain/controller.ts";
import { jsonFetch } from "../domain/json-fetch.ts";
import { nonnull } from "../domain/nullish.ts";
import { SubAgentController } from "../domain/sub-agent-controller.ts";
import {
	createAzureAlreadyReviewedHandler,
	createAzureExistingRefusalHandler,
	createForbiddenHtmlAzureHandler,
	createRejectedAzurePolicyHandler,
} from "./azure-mocks.ts";
import {
	type AzureReReviewRecorder,
	createAzureReReviewHandlers,
} from "./azure-rereview-mocks.ts";
import {
	createFailedGitHubChecksHandler,
	createForbiddenHtmlGitHubHandler,
	createGitHubAlreadyReviewedHandler,
	createGitHubExistingRefusalHandler,
	createInProgressGitHubChecksHandlers,
} from "./github-mocks.ts";
import {
	createGitHubReReviewHandlers,
	type GitHubReReviewRecorder,
} from "./github-rereview-mocks.ts";
import { mockServer, resetHostMocks, scenarioToken } from "./mock-server.ts";
import {
	reportForProbe,
	reportForReReviewProbe,
	runScenario,
} from "./scenario.ts";
import { createScenarioRepo } from "./scenario-repo.ts";

const repo = createScenarioRepo();

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

it("MainAgentController prepares merge-base surface, preserves trailing blank lines, skips 0-hunk files, and posts identical outcomes across Git, GitHub, and AzureDevOps", async () => {
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

	assert.equal(gitRun.prepared.change.author, "author@example.com");
	assert.equal(
		gitRun.prepared.change.description,
		"Refine helper\n\nSecond body.\n\nAdd y export\n\nFirst body.",
	);
	assert.equal(
		githubRun.prepared.change.description,
		gitRun.prepared.change.description,
	);
	assert.equal(
		azureRun.prepared.change.description,
		gitRun.prepared.change.description,
	);

	const surfacePaths = gitRun.prepared.snapshot.surface().map((f) => f.path);
	assert.deepEqual(surfacePaths, ["helper.ts", "service.ts"]);

	const snapshotDir = repo
		.workdirFor("scenario-git")
		.snapshotDirectory()
		.toString();
	assert.equal(
		readFileSync(join(snapshotDir, "helper.ts"), "utf8"),
		"export const z = 3;\n\n",
	);
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

it("MainAgentController handles re-review with narrowed surface, GraphQL pagination, thread settle/reopen, and closing stale Azure refusals", async () => {
	const ghRecorder: GitHubReReviewRecorder = {
		settledThreadIds: [],
		reopenedThreadIds: [],
		postedBodies: [],
	};
	mockServer.use(...createGitHubReReviewHandlers(repo, ghRecorder));
	const ghWorkdir = repo.workdirFor("rereview-github");
	const ghController = MainAgentController.withRunner((_, sub) => {
		assert.equal(sub.change().description, "Re-review body");
		assert.equal(sub.instructions().prose().length, 8);
		assert.equal(sub.workdir().equals(ghWorkdir), true);
		reportForReReviewProbe(sub);
	});
	const ghPrep = await ghController.prepareWithToken(
		repo.githubTarget,
		ghWorkdir,
		scenarioToken,
	);
	assert.equal(ghPrep.success, true);
	assert.equal(ghPrep.data.headCommit, repo.headCommitV2);
	assert.equal(ghPrep.data.snapshot.threads().threads.length, 2);

	const ghDispatch = await ghController.dispatch(ghWorkdir);
	assert.equal(ghDispatch.kind, "submitted");
	assert.deepEqual(ghRecorder.settledThreadIds, ["T_open_fixed"]);
	assert.deepEqual(ghRecorder.reopenedThreadIds, ["T_resolved_recurring"]);
	assert.equal(ghRecorder.postedBodies.length, 1);

	const azRecorder: AzureReReviewRecorder = {
		patchedThreads: [],
		createdThreads: [],
	};
	mockServer.use(...createAzureReReviewHandlers(repo, azRecorder));
	const azWorkdir = repo.workdirFor("rereview-azure");
	const azController = MainAgentController.withRunner((_, sub) => {
		reportForReReviewProbe(sub);
	});
	const azPrep = await azController.prepareWithToken(
		repo.azureTarget,
		azWorkdir,
		scenarioToken,
	);
	assert.equal(azPrep.success, true);
	assert.equal(azPrep.data.headCommit, repo.headCommitV2);
	const azDispatch = await azController.dispatch(azWorkdir);
	assert.equal(azDispatch.kind, "submitted");
	assert.deepEqual(azRecorder.patchedThreads, [
		{ id: "90", status: "closed" },
		{ id: "10", status: "closed" },
		{ id: "11", status: "active" },
	]);
});

it("MainAgentController re-dispatches only remaining probes on timeout and exposes read-only MainAgentLedger", async () => {
	const workdir = repo.workdirFor("scenario-retry");
	let reportContext = false;
	const controller = MainAgentController.withRunner((probeName, sub) => {
		if (probeName.endsWith("-context") && !reportContext) {
			return;
		}
		reportForProbe(sub);
	});
	const prepared = await controller.prepare(repo.gitTarget, workdir);
	assert.equal(prepared.success, true);

	const firstDispatch = await controller.dispatch(workdir);
	assert.equal(firstDispatch.kind, "pending");
	assert.equal(controller.ledger(workdir).pending().length, 1);
	assert.equal(controller.ledger(workdir).submittedOutcome(), null);

	reportContext = true;
	const secondDispatch = await controller.dispatch(workdir);
	assert.equal(secondDispatch.kind, "submitted");
	assert.deepEqual(controller.ledger(workdir).pending(), []);
	assert.equal(
		controller.ledger(workdir).submittedOutcome()?.verdict,
		"request-changes",
	);
});

it("MainAgentController returns typed errors for invalid-target, too-large, already-reviewed, and refused (with idempotent refusal)", async () => {
	const noop = MainAgentController.create();
	const invalid = await noop.prepare(
		"invalid-target",
		repo.workdirFor("err-invalid"),
	);
	assert.equal(invalid.success, false);
	assert.equal(invalid.error.kind, "invalid-target");

	const tooLarge = await noop.prepare(
		repo.gitLargeTarget,
		repo.workdirFor("err-large"),
	);
	assert.equal(tooLarge.success, false);
	assert.equal(tooLarge.error.kind, "too-large");
	assert.deepEqual(
		(tooLarge.error as Extract<typeof tooLarge.error, { kind: "too-large" }>)
			.files,
		["large-prod.ts"],
	);

	const tooLargeDiff = await noop.prepare(
		repo.gitLargeDiffTarget,
		repo.workdirFor("err-large-diff"),
	);
	assert.equal(tooLargeDiff.success, false);
	assert.equal(tooLargeDiff.error.kind, "too-large");
	const diffError = tooLargeDiff.error as Extract<
		typeof tooLargeDiff.error,
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
	const ghAlready = await noop.prepareWithToken(
		repo.githubTarget,
		repo.workdirFor("err-gh-already"),
		scenarioToken,
	);
	assert.equal(ghAlready.success, false);
	assert.equal(ghAlready.error.kind, "already-reviewed");
	assert.equal(
		(
			ghAlready.error as Extract<
				typeof ghAlready.error,
				{ kind: "already-reviewed" }
			>
		).headCommit,
		repo.headCommit,
	);

	mockServer.use(createAzureAlreadyReviewedHandler(repo.headCommit));
	const azAlready = await noop.prepareWithToken(
		repo.azureTarget,
		repo.workdirFor("err-az-already"),
		scenarioToken,
	);
	assert.equal(azAlready.success, false);
	assert.equal(azAlready.error.kind, "already-reviewed");
	assert.equal(
		(
			azAlready.error as Extract<
				typeof azAlready.error,
				{ kind: "already-reviewed" }
			>
		).headCommit,
		repo.headCommit,
	);

	mockServer.use(
		createFailedGitHubChecksHandler("ci"),
		createGitHubExistingRefusalHandler(repo.headCommit),
	);
	const ghRefused = await noop.prepareWithToken(
		repo.githubTarget,
		repo.workdirFor("err-gh-refused"),
		scenarioToken,
	);
	assert.equal(ghRefused.success, false);
	assert.equal(ghRefused.error.kind, "refused");

	mockServer.use(
		createRejectedAzurePolicyHandler(),
		createAzureExistingRefusalHandler(repo.headCommit),
	);
	const azRefused = await noop.prepareWithToken(
		repo.azureTarget,
		repo.workdirFor("err-az-refused"),
		scenarioToken,
	);
	assert.equal(azRefused.success, false);
	assert.equal(azRefused.error.kind, "refused");

	resetHostMocks(repo);
	const postedRefusals: string[] = [];
	mockServer.use(
		...createInProgressGitHubChecksHandlers("check", postedRefusals),
	);
	const ghInProgressRefused = await noop.prepare(
		repo.githubTarget,
		repo.workdirFor("err-gh-in-progress"),
	);
	assert.equal(ghInProgressRefused.success, false);
	assert.deepEqual(ghInProgressRefused.error, {
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
	const azHtml403 = await noop.prepareWithToken(
		repo.azureTarget,
		repo.workdirFor("err-az-403-html"),
		scenarioToken,
	);
	assert.equal(azHtml403.success, false);
	assert.equal(azHtml403.error.kind, "host-error");
	const azHostError = azHtml403.error as Extract<
		typeof azHtml403.error,
		{ kind: "host-error" }
	>;
	assert.equal(azHostError.status, 403);
	assert.equal(
		azHostError.reason.includes("Azure DevOps returned HTTP 403"),
		true,
	);

	const ghHtml403 = await noop.prepare(
		repo.githubTarget,
		repo.workdirFor("err-gh-403-html"),
	);
	assert.equal(ghHtml403.success, false);
	assert.equal(ghHtml403.error.kind, "host-error");
	const ghHostError = ghHtml403.error as Extract<
		typeof ghHtml403.error,
		{ kind: "host-error" }
	>;
	assert.equal(ghHostError.status, 403);
	assert.equal(ghHostError.reason.includes("GitHub returned HTTP 403"), true);
	const rawHtmlRes = await jsonFetch<{
		readonly data: Record<string, string>;
		readonly status: number;
		readonly headers: Headers;
	}>("https://api.github.com/repos/octocat/hello-world/pulls/42", {
		method: "GET",
		headers: new Headers({ "x-test": "1" }),
	});
	assert.equal(rawHtmlRes.status, 403);
	assert.deepEqual(rawHtmlRes.data, {});
});

it("MainAgentController.prepare reads GH_TOKEN and AZURE_DEVOPS_EXT_PAT from process.env, formats headers per host, and sends accept: application/json", async () => {
	const noop = MainAgentController.create();
	const seenHeaders: Array<{
		readonly host: string;
		readonly auth: string | null;
		readonly accept: string | null;
	}> = [];
	const onRequest = ({ request }: { readonly request: Request }) => {
		seenHeaders.push({
			host: new URL(request.url).host,
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
		const ghWithToken = await noop.prepare(
			repo.githubTarget,
			repo.workdirFor("env-gh-set"),
		);
		assert.equal(ghWithToken.success, true);
		const azWithToken = await noop.prepare(
			repo.azureTarget,
			repo.workdirFor("env-az-set"),
		);
		assert.equal(azWithToken.success, true);

		const expectedAzAuth = `Basic ${Buffer.from(":env-az-pat", "utf8").toString("base64")}`;
		assert.equal(
			seenHeaders
				.filter((entry) => entry.host === "api.github.com")
				.every(
					(entry) =>
						entry.auth === "Bearer env-gh-token" &&
						entry.accept === "application/json",
				),
			true,
		);
		assert.equal(
			seenHeaders
				.filter((entry) => entry.host === "dev.azure.com")
				.every(
					(entry) =>
						entry.auth === expectedAzAuth &&
						entry.accept === "application/json",
				),
			true,
		);

		seenHeaders.length = 0;
		Object.assign(process.env, {
			GH_TOKEN: "",
			AZURE_DEVOPS_EXT_PAT: "",
		});
		const ghWithoutToken = await noop.prepare(
			repo.githubTarget,
			repo.workdirFor("env-gh-empty"),
		);
		assert.equal(ghWithoutToken.success, true);
		const azWithoutToken = await noop.prepare(
			repo.azureTarget,
			repo.workdirFor("env-az-empty"),
		);
		assert.equal(azWithoutToken.success, true);
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

it("MainAgentController and SubAgentController.forWorkdir coordinate a full review across separate instances via disk persistence", async () => {
	const azureWd = repo.workdirFor("rehydrated-azure");
	const prepController = MainAgentController.create();
	const prepResult = await prepController.prepareWithToken(
		repo.azureTarget,
		azureWd,
		scenarioToken,
	);
	assert.equal(prepResult.success, true);

	const statusController = MainAgentController.create();
	const pendingProbes = statusController.ledger(azureWd).pending();
	assert.equal(pendingProbes.length > 0, true);

	const partialDispatch = await MainAgentController.create().dispatchWithToken(
		azureWd,
		scenarioToken,
	);
	assert.equal(partialDispatch.kind, "pending");

	for (const probeName of pendingProbes) {
		const sub = SubAgentController.forWorkdir(azureWd, probeName);
		reportForProbe(sub);
	}

	const dispatchController = MainAgentController.create();
	const submitted = await dispatchController.dispatchWithToken(
		azureWd,
		scenarioToken,
	);
	assert.equal(submitted.kind, "submitted");
	assert.equal(submitted.outcome.verdict, "request-changes");
});
