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
	};
	assert.equal(runSubAgentCli(deps, ["-h"]), 0);
	assert.equal(runSubAgentCli(deps, ["--help"]), 0);
	assert.equal(runSubAgentCli(deps, ["define", "Encapsulated type"]), 0);
	assert.equal(runSubAgentCli(deps, ["define", "Missing glossary term"]), 1);
});

it("Sub-agent CLI handles inspect, next, prev, and rejects mismatched ack rules", () => {
	const { factory, workdir } = setupWorkspace();
	const sessionToken = workdir.sessionToken();
	const deps = {
		workspaceFactory: factory,
		forSession: (session: string, name: string) =>
			SubAgentController.forSession(factory, session, name),
		resolveDefinition: stubResolveDefinition,
	};
	assert.equal(
		runSubAgentCli(deps, ["inspect", sessionToken, "01-purpose"]),
		0,
	);
	assert.equal(runSubAgentCli(deps, ["next", sessionToken, "01-purpose"]), 0);
	assert.equal(runSubAgentCli(deps, ["prev", sessionToken, "01-purpose"]), 0);
	assert.equal(
		runSubAgentCli(deps, [
			"ack",
			sessionToken,
			"01-purpose",
			JSON.stringify({
				message: "Inspect 01-purpose",
				rulesInOrder: ["Wrong rule"],
				observationFormat: "<observation> breaks <principle>",
			}),
		]),
		1,
	);
});

it("Sub-agent and main-agent CLIs handle ack, report, and status", async () => {
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
	};
	const ackPayload = JSON.stringify({
		message: "<SYSTEM_MESSAGE>Inspect 01-purpose</SYSTEM_MESSAGE>",
		rulesInOrder: ["Stated purpose"],
		observationFormat: "<observation> breaks <principle>",
	});
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
		runSubAgentCli(deps, ["ack", sessionToken, "01-purpose", ackPayload]),
		0,
	);
	assert.equal(
		runSubAgentCli(deps, ["report", sessionToken, "01-purpose", reportPayload]),
		0,
	);
	const mainLedger = freshMain.ledger(workdir);
	assert.deepEqual(mainLedger.pending(), []);
	assert.deepEqual(mainLedger.completed(), ["01-purpose"]);
	assert.deepEqual(mainLedger.permissions("01-purpose"), [
		"Bash(/opt/pr-review/dist/bin/review-tool-probe.mjs*)",
	]);
	assert.equal(
		mainLedger.prompt("01-purpose"),
		"Run /opt/pr-review/dist/bin/review-tool-probe.mjs inspect pr-review-session:default 01-purpose and follow its instructions.",
	);
	assert.equal(mainLedger.submittedOutcome()?.verdict, "approve");
	assert.equal(
		await runMainAgentCli(freshMain, factory, ["status", workdir.toString()]),
		0,
	);
});
