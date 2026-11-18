import assert from "node:assert/strict";
import { test as it } from "node:test";
import { z } from "zod";
import { AccessToken } from "../domain/access-token.ts";
import type { Ledger, Outcome } from "../domain/contracts.g.ts";
import type { HostAdapter } from "../domain/host-adapter.ts";
import { nonnull } from "../domain/nullish.ts";
import { CodeUnderReviewSnapshot } from "../domain/review-snapshot.ts";
import { MainAgentController } from "./controller.ts";
import { createStubLoadProbes } from "./controller-fixtures.test.ts";
import {
	createStubPort,
	HEAD_COMMIT,
	okAdapterParse,
	sampleChange,
	sampleHost,
	sampleSnapshot,
	stubAdapter,
	stubPassingRowsForAudit,
} from "./main-agent-fixtures.test.ts";
import { createMemoryWorkspace } from "./memory-workspace.test.ts";

it("MainAgentController.prepare returns invalid-target when HostAdapterPort rejects the target", async () => {
	const fallback = stubAdapter(
		{
			kind: "already-reviewed",
			headCommit: HEAD_COMMIT,
			location: "local://stub",
		},
		"local://submitted",
	);
	const port = createStubPort(
		(url) =>
			z
				.url()
				.transform(() => fallback)
				.safeDecode(url),
		fallback,
	);
	const controller = MainAgentController.create(port, createStubLoadProbes());
	const result = await controller.prepare(
		"not-a-target",
		createMemoryWorkspace("/tmp/ctrl-unit/case-1"),
	);
	assert.equal(result.success, false);
	assert.equal(result.error.kind, "invalid-target");
});

it("MainAgentController.prepare forwards non-ready adapter resolutions without persisting pull-request state", async () => {
	const workdir = createMemoryWorkspace("/tmp/ctrl-unit/case-2");
	const already = stubAdapter(
		{
			kind: "already-reviewed",
			headCommit: HEAD_COMMIT,
			location: "https://github.com/org/repo/pull/1#review-1",
		},
		"local://submitted",
	);
	const port = createStubPort(() => okAdapterParse(already), already);
	const controller = MainAgentController.create(port, createStubLoadProbes());
	const result = await controller.prepare(
		"https://github.com/org/repo/pull/1",
		workdir,
	);
	assert.equal(result.success, false);
	assert.deepEqual(result.error, {
		kind: "already-reviewed",
		headCommit: HEAD_COMMIT,
		location: "https://github.com/org/repo/pull/1#review-1",
	});
	assert.equal(workdir.readAudits().length, 0);
});

it("MainAgentController prepares a ready snapshot, tracks pending probes, and dispatches via the adapter once slices are recorded", async () => {
	const snapshot = sampleSnapshot();
	const posted: Array<{ readonly outcome: Outcome; readonly ledger: Ledger }> =
		[];
	const adapter: HostAdapter = {
		host: () => sampleHost,
		resolve: (snapshotDir) =>
			Promise.resolve({
				kind: "ready",
				headCommit: HEAD_COMMIT,
				change: sampleChange(),
				snapshot: CodeUnderReviewSnapshot.from(snapshot, snapshotDir),
			}),
		post: (outcome, ledger) => {
			posted.push({ outcome, ledger });
			return Promise.resolve("local://review-42");
		},
	};
	const port = createStubPort(() => okAdapterParse(adapter), adapter);
	const token = nonnull(AccessToken.from("unit-token").data);
	const loadProbes = createStubLoadProbes();

	const controller = MainAgentController.create(port, loadProbes);
	const workdir = createMemoryWorkspace("/tmp/ctrl-unit/case-3");
	const prepared = await controller.prepareWithToken(
		"https://github.com/org/repo/pull/42",
		workdir,
		token,
	);
	assert.equal(prepared.success, true);

	const pendingNames = [...controller.ledger(workdir).pending()];
	assert.equal(pendingNames.length > 0, true);

	const beforeDispatch = await controller.dispatch(workdir);
	assert.equal(beforeDispatch.kind, "pending");
	assert.deepEqual(beforeDispatch.remaining, pendingNames);
	assert.equal(posted.length, 0);

	const written = workdir.readAudits().map((audit) => {
		workdir.ledgerDirectory().writeSlice(audit.name, {
			headCommit: HEAD_COMMIT,
			rows: stubPassingRowsForAudit(audit.document),
		});
		return audit.name;
	});
	assert.deepEqual(written, pendingNames);

	const freshController = MainAgentController.create(port, loadProbes);
	const submitted = await freshController.dispatchWithToken(workdir, token);
	assert.equal(submitted.kind, "submitted");
	assert.equal(submitted.location, "local://review-42");
	assert.equal(submitted.outcome.verdict, "approve");
	assert.equal(posted.length, 1);
});
