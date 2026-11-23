import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { after, before, beforeEach, test as it } from "node:test";
import { HostAdapterFactory } from "../adapters/adapter-factory.ts";
import { HTTP_FORBIDDEN } from "../adapters/http-transport.ts";
import { AccessToken } from "../domain/access-token.ts";
import { HostErrorSchema } from "../domain/contracts.g.ts";
import { nonnull } from "../domain/nullish.ts";
import { sampleLedger, sampleOutcome } from "./adapter-test-fixtures.ts";
import { createFailedAzureConnectionDataHandler } from "./azure-error-mocks.ts";
import {
	AZURE_REVIEWER_ID,
	createAzureAlreadyReviewedHandler,
} from "./azure-mocks.ts";
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
	assert.equal(HostErrorSchema.parse(connErr).status, HTTP_FORBIDDEN);
});
