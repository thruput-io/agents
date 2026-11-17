import assert from "node:assert/strict";
import { test as it } from "node:test";
import { PrepareResponseSchema } from "../domain/contracts.g.ts";
import {
	createGitHubAlreadyReviewedHandler,
	createOversizedGitHubPullHandlers,
} from "./github-mocks.ts";
import { mockServer, resetHostMocks } from "./mock-server.ts";
import { scenarioToken, setupReviewCliHarness } from "./review-cli-harness.ts";
import { invokeMainCli } from "./scenario.ts";

const repo = setupReviewCliHarness();

it("Review CLI short-circuits oversized GitHub PRs without requesting check-runs, GraphQL, or zipballs, while preserving already-reviewed", async () => {
	const seenPaths: string[] = [];
	const onRequest = ({ request }: { readonly request: Request }) => {
		seenPaths.push(new URL(request.url).pathname);
	};
	mockServer.events.on("request:start", onRequest);
	try {
		resetHostMocks(repo);
		mockServer.use(...createOversizedGitHubPullHandlers(repo));
		const oversized = await invokeMainCli(
			[
				"prepare",
				repo.githubTarget,
				repo.workdirFor("shortcircuit-too-large").toString(),
				scenarioToken,
			],
			PrepareResponseSchema,
		);
		assert.equal(oversized.payload.success, false);
		assert.equal(oversized.payload.error.kind, "too-large");
		assert.equal(
			seenPaths.some((path) => path.includes("/check-runs")),
			false,
		);
		assert.equal(
			seenPaths.some((path) => path.includes("/graphql")),
			false,
		);
		assert.equal(
			seenPaths.some((path) => path.includes("/zipball/")),
			false,
		);

		seenPaths.length = 0;
		mockServer.use(createGitHubAlreadyReviewedHandler(repo.headCommit));
		const alreadyReviewed = await invokeMainCli(
			[
				"prepare",
				repo.githubTarget,
				repo.workdirFor("shortcircuit-already-reviewed").toString(),
				scenarioToken,
			],
			PrepareResponseSchema,
		);
		assert.equal(alreadyReviewed.payload.success, false);
		assert.equal(alreadyReviewed.payload.error.kind, "already-reviewed");
		assert.equal(
			seenPaths.some((path) => path.includes("/check-runs")),
			false,
		);
		assert.equal(
			seenPaths.some((path) => path.includes("/graphql")),
			false,
		);
		assert.equal(
			seenPaths.some((path) => path.includes("/zipball/")),
			false,
		);
	} finally {
		mockServer.events.removeListener("request:start", onRequest);
		resetHostMocks(repo);
	}
});
