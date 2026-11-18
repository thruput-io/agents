import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as it } from "node:test";
import { CodeUnderReviewFactory } from "../adapters/code-under-review-factory.ts";
import { runMainAgentCli } from "../client/controller-cli.ts";
import { runSubAgentCli } from "../client/sub-agent-cli.ts";
import { MainAgentController } from "../controller/controller.ts";
import { SubAgentController } from "../controller/sub-agent-controller.ts";
import { Instructions } from "./instructions.ts";
import { nonnull } from "./nullish.ts";
import { Rulebook } from "./rulebook.ts";
import { Workdir } from "./workdir.ts";

const SHA1_HEX_LENGTH = 40;
const H = "a".repeat(SHA1_HEX_LENGTH);
const INITIAL_CLOCK_MS = 1000;
const AFTER_DEADLINE_OFFSET_MS = 300_001;

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
			lines: [
				{
					idToReportViolationOn: "a.ts:1",
					text: "const x = 1;",
				},
			],
		},
	],
};
const sampleSurface = [sampleFile];
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
	workdir.ledgerDirectory().writePullRequest({
		change: sampleChange,
		surface: { headCommit: H, files: sampleSurface },
		fragments: sampleFile.fragments,
		threads: { threads: [] },
	});
	workdir.writeAudit("01-purpose", {
		instructions: SubAgentController.forProbe(
			workdir,
			nonnull(
				CodeUnderReviewFactory.from(
					"https://github.com/thruput-io/agents/pull/14",
				).data,
			),
			{
				kind: "rules",
				change: sampleChange,
				surface: { headCommit: H, files: sampleSurface },
				rulebook: rb,
			},
		)
			.instructions()
			.prose(),
		task: Instructions.forKind("rules").task() as Extract<
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

it("SubAgentController.forSession rehydrates a probe, rejects tampered audit, and hides workdir", () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "controller-rehydrate-"));
	try {
		const workdir = setupRehydratedWorkdir(tempRoot);
		const sessionToken = workdir.sessionToken();
		assert.equal(sessionToken.includes(tempRoot), false);
		const resolvedFromSession = Workdir.fromSession(sessionToken);
		assert.equal(resolvedFromSession.success, true);
		assert.equal(resolvedFromSession.data.equals(workdir), true);

		const auditFile = join(
			workdir.toString(),
			"instructions",
			"01-purpose.json",
		);
		const originalAudit = readFileSync(auditFile, "utf8");
		writeFileSync(
			auditFile,
			JSON.stringify({
				...JSON.parse(originalAudit),
				task: "Tampered task from main agent",
			}),
			"utf8",
		);
		assert.throws(() =>
			SubAgentController.forSession(sessionToken, "01-purpose"),
		);
		writeFileSync(auditFile, originalAudit, "utf8");

		const rehydratedSub = SubAgentController.forSession(
			sessionToken,
			"01-purpose",
		);
		assert.deepEqual(rehydratedSub.change(), sampleChange);
		assert.deepEqual(rehydratedSub.codeUnderReview().surface(), sampleSurface);
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

it("SubAgentController enforces ack and 5-minute deadline across rehydrated sessions", () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "controller-deadline-"));
	try {
		const workdir = setupRehydratedWorkdir(tempRoot);
		const sessionToken = workdir.sessionToken();
		let currentClock = INITIAL_CLOCK_MS;
		const rehydratedSub = SubAgentController.forSession(
			sessionToken,
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
		const beforeAckMain = MainAgentController.create().ledger(workdir);
		assert.deepEqual(beforeAckMain.acknowledged(), []);
		assert.deepEqual(beforeAckMain.unacknowledged(), ["01-purpose"]);

		const rehydratedAck = rehydratedSub.ack({
			message: "Inspect 01-purpose",
			rulesInOrder: ["Stated purpose"],
			observationFormat: "<observation> breaks <principle>",
		});
		assert.equal(rehydratedAck.success, true);
		const afterAckMain = MainAgentController.create().ledger(workdir);
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
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

it("Sub-agent CLI handles inspect, next, prev, and rejects mismatched ack rules", () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "controller-cli-nav-"));
	try {
		const workdir = setupRehydratedWorkdir(tempRoot);
		const sessionToken = workdir.sessionToken();
		assert.equal(
			runSubAgentCli(SubAgentController.forSession, [
				"inspect",
				sessionToken,
				"01-purpose",
			]),
			0,
		);
		assert.equal(
			runSubAgentCli(SubAgentController.forSession, [
				"next",
				sessionToken,
				"01-purpose",
			]),
			0,
		);
		assert.equal(
			runSubAgentCli(SubAgentController.forSession, [
				"prev",
				sessionToken,
				"01-purpose",
			]),
			0,
		);
		assert.equal(
			runSubAgentCli(SubAgentController.forSession, [
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
		const freshMain = MainAgentController.create();
		assert.equal(
			runSubAgentCli(SubAgentController.forSession, [
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
			runSubAgentCli(SubAgentController.forSession, [
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
