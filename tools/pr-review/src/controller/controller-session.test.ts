import assert from "node:assert/strict";
import { test as it } from "node:test";
import { z } from "zod";
import { ProbeSchema } from "../domain/contracts.g.ts";
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
const ACK_TIMEOUT_MS = 45_000;
const DEADLINE_MS = 300_000;
const RESPAWN_ACK_OFFSET_MS = 5000;

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
						document: ProbeSchema.parse({
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

const createClockHarness = (path: string) => {
	const factory = createMemoryWorkspaceFactory();
	const workdir = setupRehydratedWorkspace(factory, path);
	let currentClock = INITIAL_CLOCK_MS;
	const clock = {
		now: () => currentClock,
		advance: (ms: number) => {
			currentClock += ms;
		},
		sleep: (ms: number) => {
			currentClock += ms;
			return Promise.resolve();
		},
	};
	const adapterPort = createStubAdapterPort(defaultStubAdapter);
	const mainController = MainAgentController.createWithClock(
		adapterPort,
		createStubLoadProbes(),
		clock,
	);
	const rehydratedSub = SubAgentController.forWorkdirWithClock(
		workdir,
		"01-purpose",
		clock.now,
	);
	return { workdir, clock, adapterPort, mainController, rehydratedSub };
};

it("MainAgentController.status tracks ackTimeoutMs and Probe.deadlineMs thresholds in code", async () => {
	const { workdir, clock, adapterPort, mainController, rehydratedSub } =
		createClockHarness("/tmp/controller-deadline/workspace");
	assert.equal(
		rehydratedSub.report([
			{
				rule: "Stated purpose",
				examined: ["a.ts"],
				verdict: "clean",
				evidence: "stated",
			},
		]).success,
		false,
	);
	const unackedStatus = await mainController.status(workdir);
	assert.equal(clock.now(), INITIAL_CLOCK_MS + ACK_TIMEOUT_MS);
	assert.deepEqual(unackedStatus.unacknowledged, ["01-purpose"]);

	const ackedAtMs = clock.now();
	assert.equal(rehydratedSub.ack().response.deadlineMs, DEADLINE_MS);
	const expiredStatus = await mainController.status(workdir);
	assert.equal(clock.now(), ackedAtMs + DEADLINE_MS);
	assert.deepEqual(expiredStatus.acknowledged, []);
	assert.deepEqual(expiredStatus.unacknowledged, ["01-purpose"]);

	clock.advance(RESPAWN_ACK_OFFSET_MS);
	rehydratedSub.ack();
	await rehydratedSub.submitReport(
		[
			{
				rule: "Stated purpose",
				examined: ["a.ts"],
				verdict: "clean",
				evidence: "stated",
			},
		],
		adapterPort,
	);
	const completedStatus = await mainController.status(workdir);
	assert.deepEqual(completedStatus.pending, []);
	assert.equal(completedStatus.submittedOutcome?.verdict, "approve");
	assert.equal(completedStatus.location, "stub://review");
});
