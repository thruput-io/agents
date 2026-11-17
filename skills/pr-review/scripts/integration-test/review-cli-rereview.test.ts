import assert from "node:assert/strict";
import { test as it } from "node:test";
import {
	DispatchResultSchema,
	PrepareReadySchema,
	PrepareResponseSchema,
} from "../domain/contracts.g.ts";
import {
	type AzureReReviewRecorder,
	createAzureReReviewHandlers,
} from "./azure-rereview-mocks.ts";
import {
	createGitHubReReviewHandlers,
	type GitHubReReviewRecorder,
} from "./github-rereview-mocks.ts";
import { mockServer } from "./mock-server.ts";
import { scenarioToken, setupReviewCliHarness } from "./review-cli-harness.ts";
import { invokeMainCli, reportForReReviewProbe } from "./scenario.ts";

const repo = setupReviewCliHarness();

it("Review CLI handles re-review with narrowed surface, GraphQL pagination, thread settle/reopen, and closing stale Azure refusals", async () => {
	const ghRecorder: GitHubReReviewRecorder = {
		settledThreadIds: [],
		reopenedThreadIds: [],
		postedBodies: [],
	};
	const azRecorder: AzureReReviewRecorder = {
		patchedThreads: [],
		createdThreads: [],
	};
	mockServer.use(
		...createGitHubReReviewHandlers(repo, ghRecorder),
		...createAzureReReviewHandlers(repo, azRecorder),
	);
	const reReviewAdapters = [
		{
			label: "rereview-github",
			target: repo.githubTarget,
			expectedThreads: 2,
			verify: () => {
				assert.deepEqual(ghRecorder.settledThreadIds, ["T_open_fixed"]);
				assert.deepEqual(ghRecorder.reopenedThreadIds, [
					"T_resolved_recurring",
				]);
				assert.equal(ghRecorder.postedBodies.length, 1);
			},
		},
		{
			label: "rereview-azure",
			target: repo.azureTarget,
			expectedThreads: 2,
			verify: () => {
				assert.deepEqual(azRecorder.patchedThreads[0], {
					id: "90",
					status: "closed",
				});
				assert.deepEqual(
					[...azRecorder.patchedThreads.slice(1)].sort((a, b) =>
						a.id.localeCompare(b.id),
					),
					[
						{ id: "10", status: "closed" },
						{ id: "11", status: "active" },
					],
				);
			},
		},
	] as const;

	for (const adapter of reReviewAdapters) {
		const workdir = repo.workdirFor(adapter.label);
		const prep = await invokeMainCli(
			["prepare", adapter.target, workdir.toString(), scenarioToken],
			PrepareResponseSchema,
		);
		assert.equal(prep.exitCode, 0);
		assert.equal(prep.payload.success, true);
		assert.equal("headCommit" in prep.payload, false);
		assert.equal("change" in prep.payload, false);
		assert.equal(
			workdir.ledgerDirectory().readPullRequest().surface.headCommit,
			repo.headCommitV2,
		);
		assert.equal(
			workdir.ledgerDirectory().readPullRequest().threads.threads.length,
			adapter.expectedThreads,
		);
		const ready = PrepareReadySchema.parse(prep.payload);
		const inspected = await Promise.all(
			ready.pending.map((probeName) =>
				reportForReReviewProbe(ready.session, probeName),
			),
		);
		for (const entry of inspected) {
			assert.equal(entry.change.description, "Re-review body");
			assert.equal(entry.instructions.length, 9);
			assert.equal("checkout" in entry, entry.kind !== "rules");
		}
		const dispatch = await invokeMainCli(
			["dispatch", workdir.toString(), scenarioToken],
			DispatchResultSchema,
		);
		assert.equal(dispatch.exitCode, 0);
		assert.equal(dispatch.payload.kind, "submitted");
		adapter.verify();
	}
});
