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
import { SubAgentController } from "./sub-agent-controller.ts";

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

const createRecordingAdapter = () => {
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
	return { adapter, posted };
};

const submitAuditSlice = (
	workdir: ReturnType<typeof createMemoryWorkspace>,
	port: ReturnType<typeof createStubPort>,
	audit: {
		readonly name: string;
		readonly document: Parameters<typeof stubPassingRowsForAudit>[0];
	},
) => {
	const sub = SubAgentController.forWorkdir(workdir, audit.name);
	sub.ack();
	return sub.submitReport(stubPassingRowsForAudit(audit.document), port);
};

it("MainAgentController prepares a ready snapshot, tracks pending probes, and submits via the adapter when the final probe reports", async () => {
	const { adapter, posted } = createRecordingAdapter();
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
	assert.equal(controller.ledger(workdir).pending().length > 0, true);
	assert.equal(controller.ledger(workdir).submittedOutcome(), null);

	const audits = workdir.readAudits();
	const initialReports = await Promise.all(
		audits.slice(0, -1).map((audit) => submitAuditSlice(workdir, port, audit)),
	);
	assert.equal(
		initialReports.every((r) => r.success && r.data.kind === "recorded"),
		true,
	);
	const finalReport = await submitAuditSlice(
		workdir,
		port,
		nonnull(audits.at(-1)),
	);
	assert.equal(finalReport.success, true);
	assert.equal(finalReport.data.kind, "submitted");
	assert.equal(
		(finalReport.data as { readonly location?: string }).location,
		"local://review-42",
	);

	const freshController = MainAgentController.create(port, loadProbes);
	assert.deepEqual(freshController.ledger(workdir).pending(), []);
	assert.equal(
		freshController.ledger(workdir).submittedOutcome()?.verdict,
		"approve",
	);
	assert.equal(
		freshController.ledger(workdir).submittedLocation(),
		"local://review-42",
	);
	assert.equal(posted.length, 1);
});
