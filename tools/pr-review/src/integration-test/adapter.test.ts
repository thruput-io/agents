import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { after, before, beforeEach, test as it } from "node:test";
import { HostAdapterFactory } from "../adapters/adapter-factory.ts";
import { HTTP_FORBIDDEN } from "../adapters/http-transport.ts";
import { AccessToken } from "../domain/access-token.ts";
import { HostErrorSchema } from "../domain/contracts.g.ts";
import { nonnull } from "../domain/nullish.ts";
import {
	createForbiddenAzureItemsHandler,
	createForbiddenHtmlAzureHandler,
} from "./azure-error-mocks.ts";
import {
	createForbiddenGitHubGraphQlHandler,
	createForbiddenGitHubZipballHandler,
	createForbiddenHtmlGitHubHandler,
	createReadOnlyOauthScopesGitHubHandler,
	createReadOnlyViewerGitHubGraphQlHandler,
} from "./github-error-mocks.ts";
import { mockServer, resetHostMocks, scenarioToken } from "./mock-server.ts";
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
