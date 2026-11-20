import assert from "node:assert/strict";
import { test as it } from "node:test";
import { z } from "zod";
import { AgentInstructionsSchema } from "../domain/contracts.g.ts";
import { nonnull } from "../domain/nullish.ts";
import type { WorkspaceFactoryPort, WorkspacePort } from "../domain/ports.ts";
import { MainAgentController } from "./controller.ts";
import {
	createStubAdapterPort,
	createStubLoadProbes,
	defaultStubAdapter,
	H,
	rulesAuditDocument,
	sampleChange,
	sampleFile,
	sampleRulebook,
	sampleSurface,
} from "./controller-fixtures.test.ts";
import { createMemoryWorkspaceFactory } from "./memory-workspace.test.ts";
import { SubAgentController } from "./sub-agent-controller.ts";

const INITIAL_CLOCK_MS = 1000;
const AFTER_DEADLINE_OFFSET_MS = 300_001;

const setupRehydratedWorkspace = (
	factory: WorkspaceFactoryPort,
	path: string,
) => {
	const workdir = nonnull(factory.from(path).data);
	const rb = sampleRulebook();
	workdir.ledgerDirectory().writePullRequest({
		change: sampleChange,
		surface: { headCommit: H, files: sampleSurface },
		fragments: sampleFile.fragments,
		threads: { threads: [] },
	});
	workdir.writeAudit("01-purpose", rulesAuditDocument(rb));
	return workdir;
};

it("SubAgentController.forSession rehydrates a probe, rejects tampered audit, and hides workdir", () => {
	const factory = createMemoryWorkspaceFactory();
	const secretRoot = "/tmp/controller-rehydrate-secret";
	const workdir = setupRehydratedWorkspace(factory, `${secretRoot}/workspace`);
	const sessionToken = workdir.sessionToken();
	assert.equal(sessionToken.includes(secretRoot), false);
	const resolvedFromSession = factory.fromSession(sessionToken);
	assert.equal(resolvedFromSession.success, true);
	assert.equal(resolvedFromSession.data.equals(workdir), true);

	const originalAudit = nonnull(workdir.readAudits()[0]).document;
	const tamperedFactory: WorkspaceFactoryPort = {
		...factory,
		fromSession: (token) => {
			const opened = nonnull(factory.fromSession(token).data);
			return z.custom<WorkspacePort>().safeDecode({
				...opened,
				readAudits: () => [
					{
						name: "01-purpose",
						document: AgentInstructionsSchema.parse({
							...originalAudit,
							task: "Tampered task from main agent",
						}),
					},
				],
			});
		},
	};
	assert.throws(() =>
		SubAgentController.forSession(tamperedFactory, sessionToken, "01-purpose"),
	);

	const rehydratedSub = SubAgentController.forSession(
		factory,
		sessionToken,
		"01-purpose",
	);
	assert.deepEqual(rehydratedSub.change(), sampleChange);
	assert.deepEqual(rehydratedSub.codeUnderReview().surface(), sampleSurface);
});

it("SubAgentController enforces ack and 5-minute deadline across rehydrated sessions", () => {
	const factory = createMemoryWorkspaceFactory();
	const workdir = setupRehydratedWorkspace(
		factory,
		"/tmp/controller-deadline/workspace",
	);
	let currentClock = INITIAL_CLOCK_MS;
	const rehydratedSub = SubAgentController.forWorkdirWithClock(
		workdir,
		"01-purpose",
		() => currentClock,
	);
	const beforeAck = rehydratedSub.report([
		{
			rule: "Stated purpose",
			examined: ["a.ts"],
			verdict: "clean",
			evidence: "stated",
		},
	]);
	assert.equal(beforeAck.success, false);
	const adapterPort = createStubAdapterPort(defaultStubAdapter);
	const loadProbes = createStubLoadProbes();
	const beforeAckMain = MainAgentController.create(
		adapterPort,
		loadProbes,
	).ledger(workdir);
	assert.deepEqual(beforeAckMain.acknowledged(), []);
	assert.deepEqual(beforeAckMain.unacknowledged(), ["01-purpose"]);

	const rehydratedAck = rehydratedSub.ack({
		message: "Inspect 01-purpose",
		rulesInOrder: ["Stated purpose"],
		observationFormat: "<observation> breaks <principle>",
	});
	assert.equal(rehydratedAck.success, true);
	const afterAckMain = MainAgentController.create(
		adapterPort,
		loadProbes,
	).ledger(workdir);
	assert.deepEqual(afterAckMain.acknowledged(), ["01-purpose"]);
	assert.deepEqual(afterAckMain.unacknowledged(), []);

	currentClock = INITIAL_CLOCK_MS + AFTER_DEADLINE_OFFSET_MS;
	const lateReportResult = rehydratedSub.report([
		{
			rule: "Stated purpose",
			examined: ["a.ts"],
			verdict: "clean",
			evidence: "stated",
		},
	]);
	assert.equal(lateReportResult.success, true);
	assert.equal(lateReportResult.data.kind, "submitted");
});
