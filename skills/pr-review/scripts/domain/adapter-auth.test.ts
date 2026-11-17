import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { env } from "node:process";
import { after, before, beforeEach, test as it } from "node:test";
import { createFailedAzureConnectionDataHandler } from "../integration-test/azure-error-mocks.ts";
import {
	AZURE_REVIEWER_ID,
	createAzureAlreadyReviewedHandler,
} from "../integration-test/azure-mocks.ts";
import {
	mockServer,
	resetHostMocks,
	scenarioToken,
} from "../integration-test/mock-server.ts";
import { createScenarioRepo } from "../integration-test/scenario-repo.ts";
import { AccessToken } from "./access-token.ts";
import { HTTP_FORBIDDEN } from "./adapter.ts";
import { HostAdapterFactory } from "./adapter-factory.ts";
import { HostErrorSchema, type Ledger, type Outcome } from "./contracts.g.ts";
import { nonnull } from "./nullish.ts";

const repo = createScenarioRepo();
const GH_TOKEN_ENV = "GH_TOKEN";
const AZ_PAT_ENV = "AZURE_DEVOPS_EXT_PAT";

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

interface SeenHeader {
	readonly host: string;
	readonly pathname: string;
	readonly auth: string | null;
	readonly accept: string | null;
}

const captureRequestHeaders = async (
	run: () => Promise<void>,
): Promise<readonly SeenHeader[]> => {
	const seenHeaders: SeenHeader[] = [];
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
		await run();
	} finally {
		mockServer.events.removeListener("request:start", onRequest);
	}
	return seenHeaders;
};

it("Host adapters send Bearer/Basic headers when GH_TOKEN and AZURE_DEVOPS_EXT_PAT are set", async () => {
	const seenHeaders = await captureRequestHeaders(async () => {
		Object.assign(env, {
			[GH_TOKEN_ENV]: "env-gh-token",
			[AZ_PAT_ENV]: "env-az-pat",
		});
		const ghWithToken = await nonnull(
			HostAdapterFactory.from(repo.githubTarget).data,
		).resolve(repo.workdirFor("unit-env-gh-set").snapshotDirectory());
		assert.equal(ghWithToken.kind, "ready");
		const azWithToken = await nonnull(
			HostAdapterFactory.from(repo.azureTarget).data,
		).resolve(repo.workdirFor("unit-env-az-set").snapshotDirectory());
		assert.equal(azWithToken.kind, "ready");
	});
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
});

it("Host adapters omit Authorization and send accept: application/json when env tokens are empty", async () => {
	const seenHeaders: Array<{
		readonly host: string;
		readonly auth: string | null;
		readonly accept: string | null;
	}> = [];
	const onRequest = ({ request }: { readonly request: Request }) => {
		const url = new URL(request.url);
		seenHeaders.push({
			host: url.host,
			auth: request.headers.get("authorization"),
			accept: request.headers.get("accept"),
		});
	};
	mockServer.events.on("request:start", onRequest);
	try {
		Object.assign(env, {
			[GH_TOKEN_ENV]: "",
			[AZ_PAT_ENV]: "",
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
	assert.equal(HostErrorSchema.parse(connErr).status, HTTP_FORBIDDEN);
});
