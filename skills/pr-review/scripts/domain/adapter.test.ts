import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { after, before, beforeEach, test as it } from "node:test";
import {
	AZURE_REVIEWER_ID,
	createAzureAlreadyReviewedHandler,
	createFailedAzureConnectionDataHandler,
	createFailedAzureThreadCreateHandler,
	createForbiddenAzureItemsHandler,
	createForbiddenAzureWriteHandler,
	createForbiddenHtmlAzureHandler,
	createUnwriteableAzurePullRequestHandler,
} from "../integration-test/azure-mocks.ts";
import {
	createFailedGitHubCreateReviewHandler,
	createForbiddenGitHubGraphQlHandler,
	createForbiddenGitHubZipballHandler,
	createForbiddenHtmlGitHubHandler,
	createReadOnlyOAuthScopesGitHubHandler,
	createReadOnlyViewerGitHubGraphQlHandler,
} from "../integration-test/github-mocks.ts";
import {
	mockServer,
	resetHostMocks,
	scenarioToken,
} from "../integration-test/mock-server.ts";
import { createScenarioRepo } from "../integration-test/scenario-repo.ts";
import { AccessToken } from "./access-token.ts";
import { HostAdapterFactory } from "./adapter-factory.ts";
import { HostErrorSchema, type Ledger, type Outcome } from "./contracts.g.ts";
import { nonnull } from "./nullish.ts";

const repo = createScenarioRepo();

const sampleOutcome = (headCommit: string): Outcome => ({
	headCommit,
	verdict: "request-changes",
	summary: "Found violation",
	inline: [
		{
			path: "service.ts",
			side: "head",
			lines: { start: 1, end: 1 },
			body: "Issue",
		},
	],
	settle: [],
	reopen: [],
});

const sampleLedger = (headCommit: string): Ledger => ({
	headCommit,
	rows: [],
});

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

it("Host adapters map HTTP 403/400/422 host errors across resolve and post", async () => {
	const token = nonnull(AccessToken.from(scenarioToken).data);

	mockServer.use(
		createForbiddenHtmlAzureHandler(),
		createForbiddenHtmlGitHubHandler(),
	);
	const azHtml403 = await nonnull(
		HostAdapterFactory.fromWithToken(repo.azureTarget, token).data,
	).resolve(repo.workdirFor("unit-az-403-html").snapshotDirectory());
	const azHostError = HostErrorSchema.parse(azHtml403);
	assert.equal(azHostError.status, 403);
	assert.equal(azHostError.message.includes("access denied"), true);
	assert.equal(
		azHostError.reason.includes("Azure DevOps returned HTTP 403"),
		true,
	);

	const ghHtml403 = await nonnull(
		HostAdapterFactory.fromWithToken(repo.githubTarget, token).data,
	).resolve(repo.workdirFor("unit-gh-403-html").snapshotDirectory());
	const ghHostError = HostErrorSchema.parse(ghHtml403);
	assert.equal(ghHostError.status, 403);
	assert.equal(ghHostError.message.includes("access denied"), true);
	assert.equal(ghHostError.reason.includes("GitHub returned HTTP 403"), true);

	resetHostMocks(repo);
	mockServer.use(createReadOnlyOAuthScopesGitHubHandler(repo));
	const ghMissingScope = await nonnull(
		HostAdapterFactory.fromWithToken(repo.githubTarget, token).data,
	).resolve(repo.workdirFor("unit-gh-missing-scope").snapshotDirectory());
	assert.equal(HostErrorSchema.parse(ghMissingScope).status, 403);

	resetHostMocks(repo);
	mockServer.use(createReadOnlyViewerGitHubGraphQlHandler());
	const ghReadOnlyViewer = await nonnull(
		HostAdapterFactory.fromWithToken(repo.githubTarget, token).data,
	).resolve(repo.workdirFor("unit-gh-readonly-viewer").snapshotDirectory());
	assert.equal(HostErrorSchema.parse(ghReadOnlyViewer).status, 403);

	resetHostMocks(repo);
	mockServer.use(createForbiddenGitHubGraphQlHandler());
	const ghGraphQl403 = await nonnull(
		HostAdapterFactory.fromWithToken(repo.githubTarget, token).data,
	).resolve(repo.workdirFor("unit-gh-graphql-403").snapshotDirectory());
	const ghGraphQlErr = HostErrorSchema.parse(ghGraphQl403);
	assert.equal(ghGraphQlErr.status, 403);
	assert.equal(ghGraphQlErr.message, "Resource not accessible by integration");
	assert.equal(
		ghGraphQlErr.reason.includes("Resource not accessible by integration"),
		true,
	);

	resetHostMocks(repo);
	mockServer.use(createForbiddenGitHubZipballHandler());
	const ghZip403 = await nonnull(
		HostAdapterFactory.fromWithToken(repo.githubTarget, token).data,
	).resolve(repo.workdirFor("unit-gh-zip-403").snapshotDirectory());
	const ghZipErr = HostErrorSchema.parse(ghZip403);
	assert.equal(ghZipErr.status, 403);
	assert.equal(ghZipErr.message, "Repository archive access denied");

	resetHostMocks(repo);
	mockServer.use(createForbiddenAzureItemsHandler());
	const azZip403 = await nonnull(
		HostAdapterFactory.fromWithToken(repo.azureTarget, token).data,
	).resolve(repo.workdirFor("unit-az-zip-403").snapshotDirectory());
	const azZipErr = HostErrorSchema.parse(azZip403);
	assert.equal(azZipErr.status, 403);
	assert.equal(
		azZipErr.message,
		"TF401019: The Git repository with name or identifier does not exist or you do not have permissions.",
	);

	resetHostMocks(repo);
	const readOnlyJwt = nonnull(
		AccessToken.from(
			`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ scp: "vso.code" }), "utf8").toString("base64url")}.sig`,
		).data,
	);
	const azMissingJwtScope = await nonnull(
		HostAdapterFactory.fromWithToken(repo.azureTarget, readOnlyJwt).data,
	).resolve(repo.workdirFor("unit-az-missing-jwt-scope").snapshotDirectory());
	assert.equal(HostErrorSchema.parse(azMissingJwtScope).status, 403);

	resetHostMocks(repo);
	mockServer.use(createForbiddenAzureWriteHandler());
	const azReadOnlyPat = await nonnull(
		HostAdapterFactory.fromWithToken(repo.azureTarget, token).data,
	).resolve(repo.workdirFor("unit-az-readonly-pat").snapshotDirectory());
	const azReadOnlyPatErr = HostErrorSchema.parse(azReadOnlyPat);
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
	const azUnwriteablePr = await nonnull(
		HostAdapterFactory.fromWithToken(repo.azureTarget, token).data,
	).resolve(repo.workdirFor("unit-az-unwriteable-pr").snapshotDirectory());
	const azUnwriteableError = HostErrorSchema.parse(azUnwriteablePr);
	assert.equal(azUnwriteableError.status, 400);
	assert.equal(
		azUnwriteableError.message,
		"TF401181: The pull request cannot be edited due to its state.",
	);
	assert.equal(
		azUnwriteableError.reason.includes("pull request is not writeable"),
		true,
	);
	assert.equal(azUnwriteableError.reason.includes("Review must halt."), true);

	resetHostMocks(repo);
	mockServer.use(createFailedAzureThreadCreateHandler());
	const azPostErr = await nonnull(
		HostAdapterFactory.fromWithToken(repo.azureTarget, token).data,
	).post(sampleOutcome(repo.headCommit), sampleLedger(repo.headCommit));
	const decodedAzPostErr = HostErrorSchema.parse(azPostErr);
	assert.equal(decodedAzPostErr.status, 400);
	assert.equal(
		decodedAzPostErr.message,
		"TF401181: The pull request cannot be edited due to its state.",
	);

	resetHostMocks(repo);
	mockServer.use(createFailedGitHubCreateReviewHandler());
	const ghPostErr = await nonnull(
		HostAdapterFactory.fromWithToken(repo.githubTarget, token).data,
	).post(sampleOutcome(repo.headCommit), sampleLedger(repo.headCommit));
	const decodedGhPostErr = HostErrorSchema.parse(ghPostErr);
	assert.equal(decodedGhPostErr.status, 422);
	assert.equal(
		decodedGhPostErr.message,
		"Validation Failed: PullRequestReview can only have one pending review per pull request",
	);
});

it("Host adapters read GH_TOKEN and AZURE_DEVOPS_EXT_PAT from process.env, format headers per host, and send accept: application/json", async () => {
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
		const ghWithToken = await nonnull(
			HostAdapterFactory.from(repo.githubTarget).data,
		).resolve(repo.workdirFor("unit-env-gh-set").snapshotDirectory());
		assert.equal(ghWithToken.kind, "ready");
		const azWithToken = await nonnull(
			HostAdapterFactory.from(repo.azureTarget).data,
		).resolve(repo.workdirFor("unit-env-az-set").snapshotDirectory());
		assert.equal(azWithToken.kind, "ready");

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
		const ghWithoutToken = await nonnull(
			HostAdapterFactory.from(repo.githubTarget).data,
		).resolve(repo.workdirFor("unit-env-gh-empty").snapshotDirectory());
		assert.equal(ghWithoutToken.kind, "ready");
		const azWithoutToken = await nonnull(
			HostAdapterFactory.from(repo.azureTarget).data,
		).resolve(repo.workdirFor("unit-env-az-empty").snapshotDirectory());
		assert.equal(azWithoutToken.kind, "ready");
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

it("AzureDevOpsAdapter returns already-reviewed for already-reviewed Azure targets", async () => {
	mockServer.use(createAzureAlreadyReviewedHandler(repo.headCommit));
	const azAlready = await nonnull(
		HostAdapterFactory.fromWithToken(
			repo.azureTarget,
			nonnull(AccessToken.from(scenarioToken).data),
		).data,
	).resolve(repo.workdirFor("unit-az-already").snapshotDirectory());
	assert.equal(azAlready.kind, "already-reviewed");
});

it("AzureDevOpsAdapter resolves reviewer GUID from connectionData during pre-flight and fails fast on connectionData errors", async () => {
	const token = nonnull(AccessToken.from(scenarioToken).data);
	const seenPaths: string[] = [];
	const onRequest = ({ request }: { readonly request: Request }) => {
		seenPaths.push(new URL(request.url).pathname);
	};
	mockServer.events.on("request:start", onRequest);
	try {
		const posted = await nonnull(
			HostAdapterFactory.fromWithToken(repo.azureTarget, token).data,
		).post(sampleOutcome(repo.headCommit), sampleLedger(repo.headCommit));
		assert.equal(typeof posted, "string");
		assert.equal(
			seenPaths.some((path) => path.endsWith(`/${AZURE_REVIEWER_ID}`)),
			true,
		);
		assert.equal(
			seenPaths.some((path) => path.endsWith("/reviewers/me")),
			false,
		);
	} finally {
		mockServer.events.removeListener("request:start", onRequest);
	}

	mockServer.use(createFailedAzureConnectionDataHandler());
	const connErr = await nonnull(
		HostAdapterFactory.fromWithToken(repo.azureTarget, token).data,
	).resolve(repo.workdirFor("unit-az-conn-403").snapshotDirectory());
	assert.equal(HostErrorSchema.parse(connErr).status, 403);
});
