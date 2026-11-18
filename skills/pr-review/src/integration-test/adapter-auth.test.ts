import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { env } from "node:process";
import { after, before, beforeEach, test as it } from "node:test";
import { HostAdapterFactory } from "../adapters/adapter-factory.ts";
import { nonnull } from "../domain/nullish.ts";
import { mockServer, resetHostMocks } from "./mock-server.ts";
import { createScenarioRepo } from "./scenario-repo.ts";

const repo = createScenarioRepo();
const GH_TOKEN_ENV = "GH_TOKEN";
const AZ_PAT_ENV = "AZURE_DEVOPS_EXT_PAT";

const setAuthEnv = (ghToken: string, azPat: string): void => {
	Reflect.set(env, GH_TOKEN_ENV, ghToken);
	Reflect.set(env, AZ_PAT_ENV, azPat);
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
		setAuthEnv("env-gh-token", "env-az-pat");
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
	const seenHeaders = await captureRequestHeaders(async () => {
		setAuthEnv("", "");
		const ghWithoutToken = await nonnull(
			HostAdapterFactory.from(repo.githubTarget).data,
		).resolve(repo.workdirFor("unit-env-gh-empty").snapshotDirectory());
		assert.equal(ghWithoutToken.kind, "ready");
		const azWithoutToken = await nonnull(
			HostAdapterFactory.from(repo.azureTarget).data,
		).resolve(repo.workdirFor("unit-env-az-empty").snapshotDirectory());
		assert.equal(azWithoutToken.kind, "ready");
	});
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
});
