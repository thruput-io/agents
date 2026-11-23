import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { after, before, beforeEach, test as it } from "node:test";
import { HostAdapterFactory } from "../adapters/adapter-factory.ts";
import { HTTP_FORBIDDEN } from "../adapters/http-transport.ts";
import { AccessToken } from "../domain/access-token.ts";
import { HostErrorSchema } from "../domain/contracts.g.ts";
import { nonnull } from "../domain/nullish.ts";
import { sampleLedger, sampleOutcome } from "./adapter-test-fixtures.ts";
import {
	createFailedAzureThreadCreateHandler,
	createForbiddenAzureWriteHandler,
	createUnwriteableAzurePullRequestHandler,
} from "./azure-error-mocks.ts";
import { createFailedGitHubCreateReviewHandler } from "./github-error-mocks.ts";
import { mockServer, resetHostMocks, scenarioToken } from "./mock-server.ts";
import { createScenarioRepo } from "./scenario-repo.ts";

const HTTP_BAD_REQUEST = 400;
const HTTP_UNPROCESSABLE = 422;
const JWT_HEADER = Buffer.from(
	JSON.stringify({ alg: "HS256" }),
	"utf8",
).toString("base64url");
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
