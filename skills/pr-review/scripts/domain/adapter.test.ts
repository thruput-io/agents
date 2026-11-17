import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { after, before, beforeEach, test as it } from "node:test";
import { HTTP_FORBIDDEN } from "../adapters/http-transport.ts";
import {
	createFailedAzureThreadCreateHandler,
	createForbiddenAzureItemsHandler,
	createForbiddenAzureWriteHandler,
	createForbiddenHtmlAzureHandler,
	createUnwriteableAzurePullRequestHandler,
} from "../integration-test/azure-error-mocks.ts";
import {
	createFailedGitHubCreateReviewHandler,
	createForbiddenGitHubGraphQlHandler,
	createForbiddenGitHubZipballHandler,
	createForbiddenHtmlGitHubHandler,
	createReadOnlyOauthScopesGitHubHandler,
	createReadOnlyViewerGitHubGraphQlHandler,
} from "../integration-test/github-error-mocks.ts";
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

const HTTP_BAD_REQUEST = 400;
const HTTP_UNPROCESSABLE = 422;
const JWT_HEADER = Buffer.from(
	JSON.stringify({ alg: "HS256" }),
	"utf8",
).toString("base64url");
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

it("Host adapters map HTML 403 and missing GitHub OAuth/viewer permissions", async () => {
	const token = nonnull(AccessToken.from(scenarioToken).data);

	mockServer.use(
		createForbiddenHtmlAzureHandler(),
		createForbiddenHtmlGitHubHandler(),
	);
	const azHtml403 = await nonnull(
		HostAdapterFactory.fromWithToken(repo.azureTarget, token).data,
	).resolve(repo.workdirFor("unit-az-403-html").snapshotDirectory());
	const azHostError = HostErrorSchema.parse(azHtml403);
	assert.equal(azHostError.status, HTTP_FORBIDDEN);
	assert.equal(azHostError.message.includes("access denied"), true);
	assert.equal(
		azHostError.reason.includes("Azure DevOps returned HTTP 403"),
		true,
	);

	const ghHtml403 = await nonnull(
		HostAdapterFactory.fromWithToken(repo.githubTarget, token).data,
	).resolve(repo.workdirFor("unit-gh-403-html").snapshotDirectory());
	const ghHostError = HostErrorSchema.parse(ghHtml403);
	assert.equal(ghHostError.status, HTTP_FORBIDDEN);
	assert.equal(ghHostError.message.includes("access denied"), true);
	assert.equal(ghHostError.reason.includes("GitHub returned HTTP 403"), true);

	resetHostMocks(repo);
	mockServer.use(createReadOnlyOauthScopesGitHubHandler(repo));
	const ghMissingScope = await nonnull(
		HostAdapterFactory.fromWithToken(repo.githubTarget, token).data,
	).resolve(repo.workdirFor("unit-gh-missing-scope").snapshotDirectory());
	assert.equal(HostErrorSchema.parse(ghMissingScope).status, HTTP_FORBIDDEN);

	resetHostMocks(repo);
	mockServer.use(createReadOnlyViewerGitHubGraphQlHandler());
	const ghReadOnlyViewer = await nonnull(
		HostAdapterFactory.fromWithToken(repo.githubTarget, token).data,
	).resolve(repo.workdirFor("unit-gh-readonly-viewer").snapshotDirectory());
	assert.equal(HostErrorSchema.parse(ghReadOnlyViewer).status, HTTP_FORBIDDEN);
});

it("Host adapters map GraphQL and archive download 403 errors", async () => {
	const token = nonnull(AccessToken.from(scenarioToken).data);

	mockServer.use(createForbiddenGitHubGraphQlHandler());
	const ghGraphQl403 = await nonnull(
		HostAdapterFactory.fromWithToken(repo.githubTarget, token).data,
	).resolve(repo.workdirFor("unit-gh-graphql-403").snapshotDirectory());
	const ghGraphQlErr = HostErrorSchema.parse(ghGraphQl403);
	assert.equal(ghGraphQlErr.status, HTTP_FORBIDDEN);
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
	assert.equal(ghZipErr.status, HTTP_FORBIDDEN);
	assert.equal(ghZipErr.message, "Repository archive access denied");

	resetHostMocks(repo);
	mockServer.use(createForbiddenAzureItemsHandler());
	const azZip403 = await nonnull(
		HostAdapterFactory.fromWithToken(repo.azureTarget, token).data,
	).resolve(repo.workdirFor("unit-az-zip-403").snapshotDirectory());
	const azZipErr = HostErrorSchema.parse(azZip403);
	assert.equal(azZipErr.status, HTTP_FORBIDDEN);
	assert.equal(
		azZipErr.message,
		"TF401019: The Git repository with name or identifier does not exist or you do not have permissions.",
	);
});

it("Host adapters map Azure DevOps scope, write permission, and unwriteable PR errors", async () => {
	const token = nonnull(AccessToken.from(scenarioToken).data);

	const readOnlyJwt = nonnull(
		AccessToken.from(
			`${JWT_HEADER}.${Buffer.from(JSON.stringify({ scp: "vso.code" }), "utf8").toString("base64url")}.sig`,
		).data,
	);
	const azMissingJwtScope = await nonnull(
		HostAdapterFactory.fromWithToken(repo.azureTarget, readOnlyJwt).data,
	).resolve(repo.workdirFor("unit-az-missing-jwt-scope").snapshotDirectory());
	assert.equal(HostErrorSchema.parse(azMissingJwtScope).status, HTTP_FORBIDDEN);

	resetHostMocks(repo);
	mockServer.use(createForbiddenAzureWriteHandler());
	const azReadOnlyPat = await nonnull(
		HostAdapterFactory.fromWithToken(repo.azureTarget, token).data,
	).resolve(repo.workdirFor("unit-az-readonly-pat").snapshotDirectory());
	const azReadOnlyPatErr = HostErrorSchema.parse(azReadOnlyPat);
	assert.equal(azReadOnlyPatErr.status, HTTP_FORBIDDEN);
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
	assert.equal(azUnwriteableError.status, HTTP_BAD_REQUEST);
	assert.equal(
		azUnwriteableError.message,
		"TF401181: The pull request cannot be edited due to its state.",
	);
	assert.equal(
		azUnwriteableError.reason.includes("pull request is not writeable"),
		true,
	);
	assert.equal(azUnwriteableError.reason.includes("Review must halt."), true);
});

it("Host adapters map Azure 400 and GitHub 422 errors during post", async () => {
	const token = nonnull(AccessToken.from(scenarioToken).data);

	mockServer.use(createFailedAzureThreadCreateHandler());
	const azPostErr = await nonnull(
		HostAdapterFactory.fromWithToken(repo.azureTarget, token).data,
	).post(sampleOutcome(repo.headCommit), sampleLedger(repo.headCommit));
	const decodedAzPostErr = HostErrorSchema.parse(azPostErr);
	assert.equal(decodedAzPostErr.status, HTTP_BAD_REQUEST);
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
	assert.equal(decodedGhPostErr.status, HTTP_UNPROCESSABLE);
	assert.equal(
		decodedGhPostErr.message,
		"Validation Failed: PullRequestReview can only have one pending review per pull request",
	);
});
