import assert from "node:assert/strict";
import { test as it } from "node:test";
import { MainAgentController } from "../controller/controller.ts";
import {
	createStubAdapterPort,
	createStubLoadProbes,
	defaultStubAdapter,
	H,
	rulesAuditDocument,
	sampleChange,
	sampleFile,
	sampleRulebook,
} from "../controller/controller-fixtures.test.ts";
import { createMemoryWorkspaceFactory } from "../controller/memory-workspace.test.ts";
import { SubAgentController } from "../controller/sub-agent-controller.ts";
import { nonnull } from "../domain/nullish.ts";
import type { DefineLookupResult } from "../domain/ports.ts";
import { runMainAgentCli } from "./controller-cli.ts";
import { runSubAgentCli } from "./sub-agent-cli.ts";

const stubResolveDefinition = (
	term: string,
	depth: number,
): DefineLookupResult => {
	if (term === "Missing glossary term") {
		return { success: false, error: `Unknown definition term: ${term}` };
	}
	return {
		success: true,
		data: {
			success: true,
			term,
			depth,
			definitions: [{ id: term, specification: "Stub definition." }],
		},
	};
};

const setupWorkspace = () => {
	const factory = createMemoryWorkspaceFactory();
	const workdir = nonnull(factory.from("/tmp/client-cli/workspace").data);
	const rb = sampleRulebook();
	workdir.ledgerDirectory().writePullRequest({
		change: sampleChange,
		surface: { headCommit: H, files: [sampleFile] },
		fragments: sampleFile.fragments,
		threads: { threads: [] },
	});
	workdir.writeAudit("01-purpose", rulesAuditDocument(rb));
	return { factory, workdir };
};

it("controller CLIs support -h / --help and define routing without adapters", async () => {
	const factory = createMemoryWorkspaceFactory();
	const freshMain = MainAgentController.create(
		createStubAdapterPort(defaultStubAdapter),
		createStubLoadProbes(),
	);
	assert.equal(await runMainAgentCli(freshMain, factory, ["-h"]), 0);
	assert.equal(await runMainAgentCli(freshMain, factory, ["--help"]), 0);

	const deps = {
		workspaceFactory: factory,
		forSession: (session: string, name: string) =>
			SubAgentController.forSession(factory, session, name),
		resolveDefinition: stubResolveDefinition,
		adapters: createStubAdapterPort(defaultStubAdapter),
	};
	assert.equal(await runSubAgentCli(deps, ["-h"]), 0);
	assert.equal(await runSubAgentCli(deps, ["--help"]), 0);
	assert.equal(await runSubAgentCli(deps, ["define", "Encapsulated type"]), 0);
	assert.equal(
		await runSubAgentCli(deps, ["define", "Missing glossary term"]),
		1,
	);
	assert.equal(
		await runSubAgentCli(deps, [
			"report",
			"pr-review-session:invalid",
			"01-purpose",
			"not-json",
		]),
		1,
	);
	assert.equal(
		await runMainAgentCli(freshMain, factory, ["unknown-command"]),
		1,
	);
});

it("Sub-agent CLI handles instructions, ack, rules, next, and prev", async () => {
	const { factory, workdir } = setupWorkspace();
	const sessionToken = workdir.sessionToken();
	const deps = {
		workspaceFactory: factory,
		forSession: (session: string, name: string) =>
			SubAgentController.forSession(factory, session, name),
		resolveDefinition: stubResolveDefinition,
		adapters: createStubAdapterPort(defaultStubAdapter),
	};
	assert.equal(
		await runSubAgentCli(deps, ["instructions", sessionToken, "01-purpose"]),
		0,
	);
	assert.equal(
		await runSubAgentCli(deps, ["ack", sessionToken, "01-purpose"]),
		1,
	);
	assert.equal(
		await runSubAgentCli(deps, [
			"ack",
			sessionToken,
			"01-purpose",
			JSON.stringify({ acknowledged: true }),
		]),
		0,
	);
	assert.equal(
		await runSubAgentCli(deps, ["rules", sessionToken, "01-purpose"]),
		0,
	);
	assert.equal(
		await runSubAgentCli(deps, [
			"rules",
			sessionToken,
			"01-purpose",
			"https://thruput.se/agents/",
		]),
		1,
	);
	assert.equal(
		await runSubAgentCli(deps, ["next", sessionToken, "01-purpose"]),
		0,
	);
	assert.equal(
		await runSubAgentCli(deps, ["prev", sessionToken, "01-purpose"]),
		0,
	);
});

it("Sub-agent and main-agent CLIs handle instructions, ack, report, and status", async () => {
	const { factory, workdir } = setupWorkspace();
	const sessionToken = workdir.sessionToken();
	const freshMain = MainAgentController.create(
		createStubAdapterPort(defaultStubAdapter),
		createStubLoadProbes(),
	);
	const deps = {
		workspaceFactory: factory,
		forSession: (session: string, name: string) =>
			SubAgentController.forSession(factory, session, name),
		resolveDefinition: stubResolveDefinition,
		adapters: createStubAdapterPort(defaultStubAdapter),
	};
	const reportPayload = JSON.stringify({
		oneRowPerRuleInOrder: [
			{
				rule: "Stated purpose",
				examined: ["a.ts"],
				verdict: "clean",
				evidence: "stated",
			},
		],
	});
	assert.equal(
		await runSubAgentCli(deps, [
			"ack",
			sessionToken,
			"01-purpose",
			JSON.stringify({ acknowledged: true }),
		]),
		0,
	);
	assert.equal(
		await runSubAgentCli(deps, [
			"report",
			sessionToken,
			"01-purpose",
			reportPayload,
		]),
		0,
	);
	const mainLedger = freshMain.ledger(workdir);
	assert.deepEqual(mainLedger.pending(), []);
	assert.deepEqual(mainLedger.completed(), ["01-purpose"]);
	assert.deepEqual(mainLedger.permissions("01-purpose"), [
		"Bash(review-tool-probe.mjs*)",
	]);
	assert.equal(mainLedger.submittedOutcome()?.verdict, "approve");
	assert.equal(mainLedger.submittedLocation(), "stub://review");
	assert.equal(
		await runMainAgentCli(freshMain, factory, ["status", workdir.toString()]),
		0,
	);
});
