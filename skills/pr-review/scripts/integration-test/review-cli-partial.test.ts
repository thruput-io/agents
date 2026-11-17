import assert from "node:assert/strict";
import { test as it } from "node:test";
import {
	DispatchResultSchema,
	PrepareReadySchema,
	PrepareResponseSchema,
	ReviewStatusSchema,
} from "../domain/contracts.g.ts";
import { setupReviewCliHarness } from "./review-cli-harness.ts";
import { invokeMainCli, reportForProbe } from "./scenario.ts";

const repo = setupReviewCliHarness();

it("Review CLI reports pending probes on partial completion and submits once remaining probes report", async () => {
	const workdir = repo.workdirFor("scenario-retry");
	const prepared = await invokeMainCli(
		["prepare", repo.gitTarget, workdir.toString()],
		PrepareResponseSchema,
	);
	assert.equal(prepared.exitCode, 0);
	assert.equal(prepared.payload.success, true);
	const ready = PrepareReadySchema.parse(prepared.payload);

	const contextProbes = ready.pending.filter((name) =>
		name.endsWith("-context"),
	);
	const rulebookProbes = ready.pending.filter(
		(name) => !name.endsWith("-context"),
	);
	await Promise.all(
		rulebookProbes.map((probeName) => reportForProbe(ready.session, probeName)),
	);

	const firstDispatch = await invokeMainCli(
		["dispatch", workdir.toString()],
		DispatchResultSchema,
	);
	assert.equal(firstDispatch.exitCode, 0);
	assert.equal(firstDispatch.payload.kind, "pending");
	assert.deepEqual(firstDispatch.payload.remaining, contextProbes);

	const firstStatus = await invokeMainCli(
		["status", workdir.toString()],
		ReviewStatusSchema,
	);
	assert.equal(firstStatus.exitCode, 0);
	assert.deepEqual(firstStatus.payload.pending, contextProbes);
	assert.equal(firstStatus.payload.submittedOutcome, null);

	await Promise.all(
		contextProbes.map((probeName) => reportForProbe(ready.session, probeName)),
	);

	const secondDispatch = await invokeMainCli(
		["dispatch", workdir.toString()],
		DispatchResultSchema,
	);
	assert.equal(secondDispatch.exitCode, 0);
	assert.equal(secondDispatch.payload.kind, "submitted");

	const secondStatus = await invokeMainCli(
		["status", workdir.toString()],
		ReviewStatusSchema,
	);
	assert.equal(secondStatus.exitCode, 0);
	assert.deepEqual(secondStatus.payload.pending, []);
	assert.deepEqual(secondStatus.payload.completed, [...ready.pending]);
});
