import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as it } from "node:test";
import { fileURLToPath } from "node:url";
import { MainAgentController } from "../controller/controller.ts";
import { SubAgentController } from "../controller/sub-agent-controller.ts";
import { Instructions } from "../domain/instructions.ts";
import { nonnull } from "../domain/nullish.ts";
import { Rulebook } from "../domain/rulebook.ts";
import { Workdir } from "../io/workdir.ts";
import { runMainAgentCli } from "./controller-cli.ts";
import { runSubAgentCli } from "./sub-agent-cli.ts";

const CLIENT_DIR = fileURLToPath(new URL(".", import.meta.url));
const MAX_CLI_OUTPUT_BYTES = 9000;
const SHA1_HEX_LENGTH = 40;
const H = "a".repeat(SHA1_HEX_LENGTH);

const sampleRulebook = () =>
	nonnull(
		Rulebook.slice(
			[
				{
					id: "Stated purpose",
					body: "State the [[Purpose]] of every [[Change]].",
					parent: "You aren't gonna need it",
					marker: "MUST",
					group: "Purpose",
				},
			],
			{
				principles: [
					{
						id: "You aren't gonna need it",
						body: "Always implement things when you actually need them.",
						parent: "Code is a liability, not an asset",
					},
				],
			},
		).data,
	);

const sampleFile = {
	path: "a.ts",
	fragments: [
		{
			kind: "surface" as const,
			side: "head" as const,
			lines: [{ idToReportViolationOn: "a.ts:1", text: "const x = 1;" }],
		},
	],
};

const sampleChange = {
	host: {
		kind: "github" as const,
		owner: "thruput-io",
		repository: "agents",
		number: 14,
	},
	author: "author",
	description: "Body",
};

const setupRehydratedWorkdir = (tempRoot: string) => {
	const workdir = nonnull(Workdir.from(join(tempRoot, "workspace")).data);
	const rb = sampleRulebook();
	const rulesDoc = Instructions.forKind("rules");
	workdir.ledgerDirectory().writePullRequest({
		change: sampleChange,
		surface: { headCommit: H, files: [sampleFile] },
		fragments: sampleFile.fragments,
		threads: { threads: [] },
	});
	workdir.writeAudit("01-purpose", {
		instructions: rulesDoc.prose(),
		task: rulesDoc.task() as Extract<
			ReturnType<SubAgentController["inspect"]>,
			{ readonly kind: "rules" }
		>["task"],
		permissions: ["Bash(review-tool-probe*)"],
		kind: "rules",
		change: sampleChange,
		surface: { headCommit: H, changedFiles: 1, totalPages: 1 },
		ruleset: rb.toRuleset(),
	});
	return workdir;
};

const runSubCli = (args: readonly string[]): number =>
	runSubAgentCli(
		(session, name) => SubAgentController.forSession(session, name),
		args,
	);

it("sub-agent-controller define resolves [[term]]s with default depth 1, configurable depth, and unknown-term errors", () => {
	const cliPath = join(CLIENT_DIR, "sub-agent-cli.ts");
	const defaultRun = spawnSync(
		process.execPath,
		[cliPath, "define", "Encapsulated type"],
		{ encoding: "utf8" },
	);
	assert.equal(defaultRun.status, 0);
	const defaultPayload = JSON.parse(defaultRun.stdout) as {
		readonly success: boolean;
		readonly term: string;
		readonly depth: number;
		readonly definitions: readonly { readonly id: string }[];
	};
	assert.equal(defaultPayload.success, true);
	assert.equal(defaultPayload.term, "Encapsulated type");
	assert.equal(defaultPayload.depth, 1);
	assert.equal(defaultPayload.definitions[0]?.id, "Encapsulated type");
	assert.equal(defaultPayload.definitions.length > 1, true);
	assert.equal(
		Buffer.byteLength(defaultRun.stdout, "utf8") <= MAX_CLI_OUTPUT_BYTES,
		true,
	);

	const depthZeroRun = spawnSync(
		process.execPath,
		[cliPath, "define", "Encapsulated type", "0"],
		{ encoding: "utf8" },
	);
	assert.equal(depthZeroRun.status, 0);
	const depthZeroPayload = JSON.parse(depthZeroRun.stdout) as {
		readonly definitions: readonly { readonly id: string }[];
	};
	assert.deepEqual(
		depthZeroPayload.definitions.map((d) => d.id),
		["Encapsulated type"],
	);

	const unknownRun = spawnSync(
		process.execPath,
		[cliPath, "define", "Missing glossary term"],
		{ encoding: "utf8" },
	);
	assert.equal(unknownRun.status, 1);
});

it("controller CLIs support -h / --help with row schemas and execute correctly through symlinks", async () => {
	const freshMain = MainAgentController.default();
	assert.equal(await runMainAgentCli(freshMain, ["-h"]), 0);
	assert.equal(await runMainAgentCli(freshMain, ["--help"]), 0);
	const openProbe = (session: string, name: string) =>
		SubAgentController.forSession(session, name);
	assert.equal(runSubAgentCli(openProbe, ["-h"]), 0);
	assert.equal(runSubAgentCli(openProbe, ["--help"]), 0);

	const tempRoot = mkdtempSync(join(tmpdir(), "cli-symlink-"));
	const linkedSubCli = join(tempRoot, "review-tool-probe");
	symlinkSync(join(CLIENT_DIR, "sub-agent-cli.ts"), linkedSubCli);
	const helpRun = spawnSync(process.execPath, [linkedSubCli, "-h"], {
		encoding: "utf8",
	});
	assert.equal(helpRun.status, 0);
	assert.equal(helpRun.stdout.includes("idToReportViolationOn"), true);

	const badRun = spawnSync(process.execPath, [linkedSubCli, "unknown-cmd"], {
		encoding: "utf8",
	});
	assert.notEqual(badRun.status, 0);

	rmSync(tempRoot, { recursive: true, force: true });
});

it("Sub-agent CLI handles inspect, next, prev, and rejects mismatched ack rules", () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "controller-cli-nav-"));
	try {
		const workdir = setupRehydratedWorkdir(tempRoot);
		const sessionToken = workdir.sessionToken();
		assert.equal(runSubCli(["inspect", sessionToken, "01-purpose"]), 0);
		assert.equal(runSubCli(["next", sessionToken, "01-purpose"]), 0);
		assert.equal(runSubCli(["prev", sessionToken, "01-purpose"]), 0);
		assert.equal(
			runSubCli([
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
		process.exitCode = 0;
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

it("Sub-agent and main-agent CLIs handle ack, report, and status", async () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "controller-cli-report-"));
	try {
		const workdir = setupRehydratedWorkdir(tempRoot);
		const sessionToken = workdir.sessionToken();
		const freshMain = MainAgentController.default();
		assert.equal(
			runSubCli([
				"ack",
				sessionToken,
				"01-purpose",
				JSON.stringify({
					message: "<SYSTEM_MESSAGE>Inspect 01-purpose</SYSTEM_MESSAGE>",
					rulesInOrder: ["Stated purpose"],
					observationFormat: "<observation> breaks <principle>",
				}),
			]),
			0,
		);
		assert.equal(
			runSubCli([
				"report",
				sessionToken,
				"01-purpose",
				JSON.stringify({
					oneRowPerRuleInOrder: [
						{
							rule: "Stated purpose",
							examined: ["a.ts"],
							verdict: "clean",
							evidence: "stated",
						},
					],
				}),
			]),
			0,
		);
		const mainLedger = freshMain.ledger(workdir);
		assert.deepEqual(mainLedger.pending(), []);
		assert.deepEqual(mainLedger.completed(), ["01-purpose"]);
		assert.deepEqual(mainLedger.permissions("01-purpose"), [
			"Bash(review-tool-probe*)",
		]);
		assert.equal(mainLedger.submittedOutcome()?.verdict, "approve");
		assert.equal(
			await runMainAgentCli(freshMain, ["status", workdir.toString()]),
			0,
		);
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});
