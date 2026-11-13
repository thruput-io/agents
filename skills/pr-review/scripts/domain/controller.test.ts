import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test as it } from "node:test";
import { fileURLToPath } from "node:url";
import { MainAgentController } from "./controller.ts";
import { runMainAgentCli } from "./controller-cli.ts";
import { LedgerDirectory } from "./ledger-directory.ts";
import { nonnull } from "./nullish.ts";
import { CodeUnderReviewFactory } from "./review-snapshot.ts";
import { Rulebook } from "./rulebook.ts";
import { bootstrapPrompt, runSubAgentCli } from "./sub-agent-cli.ts";
import { SubAgentController } from "./sub-agent-controller.ts";
import { RulesSubAgentLedger } from "./sub-agent-ledger.ts";
import { Workdir } from "./workdir.ts";

const H = "a".repeat(40);
const DOMAIN_DIR = dirname(fileURLToPath(import.meta.url));

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
				definitions: [
					{
						id: "Purpose",
						specification: "The stated reason something is built.",
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
			lines: [{ idToReportViolationOn: 1, text: "const x = 1;" }],
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

it("Workdir parses an absolute path and derives its sibling LedgerDirectory and snapshot subdirectory", () => {
	const workdir = Workdir.from("/tmp/review/workspace");
	const same = Workdir.from("/tmp/review/workspace");
	const expectedSibling = LedgerDirectory.from("/tmp/review/ledger");
	assert.equal(workdir.success, true);
	assert.equal(same.success, true);
	assert.equal(expectedSibling.success, true);
	assert.equal(workdir.data.equals(same.data), true);
	assert.equal(workdir.data.toString(), "/tmp/review/workspace");
	assert.equal(
		workdir.data.ledgerDirectory().equals(expectedSibling.data),
		true,
	);
	assert.equal(
		workdir.data.snapshotDirectory().toString(),
		"/tmp/review/workspace/snapshot",
	);
});

it("SubAgentController exposes instructions, change, rules, codeUnderReview, and report for its probe", async () => {
	const workdir = Workdir.from("/tmp/review/workspace");
	assert.equal(workdir.success, true);
	const rb = sampleRulebook();

	const pr = CodeUnderReviewFactory.from(
		"https://github.com/thruput-io/agents/pull/14",
	);
	assert.equal(pr.success, true);
	const reviewedPr = pr.data.withReview(sampleSurface, sampleFile.fragments, {
		threads: [],
	});

	const sub = SubAgentController.forProbe(workdir.data, reviewedPr, {
		kind: "rules",
		change: sampleChange,
		surface: { headCommit: H, files: sampleSurface },
		rulebook: rb,
	});

	assert.equal(sub.workdir().equals(workdir.data), true);
	assert.deepEqual(sub.change(), sampleChange);
	assert.equal(sub.instructions().prose().length, 8);
	assert.equal(
		sub.instructions().task().includes("report one row per rule"),
		true,
	);
	assert.deepEqual(sub.codeUnderReview().surface(), sampleSurface);
	const rules = sub.rules();
	assert.equal(rules.kind, "rulebook");
	assert.deepEqual(
		[
			...(rules as { readonly kind: "rulebook"; readonly rulebook: Rulebook })
				.rulebook,
		].map((r) => r.id),
		["Stated purpose"],
	);

	const contextSub = SubAgentController.forProbe(workdir.data, reviewedPr, {
		kind: "context",
		change: sampleChange,
		surface: { headCommit: H, files: sampleSurface },
		rulesets: [],
	});
	assert.equal(contextSub.rules().kind, "rulesets");
	assert.deepEqual(sub.instructions().permissions(), [
		"Bash(node *sub-agent-controller.ts*)",
	]);
	assert.deepEqual(contextSub.instructions().permissions(), [
		"Bash(node *sub-agent-controller.ts*)",
	]);
	const deadCodeSub = SubAgentController.forProbe(workdir.data, reviewedPr, {
		kind: "dead-code",
		change: sampleChange,
		surface: { headCommit: H, files: sampleSurface },
		rulebook: rb,
	});
	assert.deepEqual(deadCodeSub.instructions().permissions(), [
		"Read",
		"Grep",
		"Glob",
		"Bash(node *sub-agent-controller.ts*)",
	]);
	const reuseSub = SubAgentController.forProbe(workdir.data, reviewedPr, {
		kind: "reuse",
		change: sampleChange,
		surface: { headCommit: H, files: sampleSurface },
		rulebook: rb,
	});
	assert.deepEqual(reuseSub.instructions().permissions(), [
		"Read",
		"Grep",
		"Glob",
		"WebSearch",
		"WebFetch",
		"Bash(node *sub-agent-controller.ts*)",
	]);
	assert.equal("checkout" in sub.inspect(), false);
	assert.equal(sub.inspect().kind, "rules");
	assert.equal(
		(deadCodeSub.inspect() as { readonly checkout?: string }).checkout,
		"/tmp/review/workspace/snapshot",
	);
	assert.equal(
		(reuseSub.inspect() as { readonly checkout?: string }).checkout,
		"/tmp/review/workspace/snapshot",
	);

	const subLedger = RulesSubAgentLedger.from(
		workdir.data.ledgerDirectory(),
		reviewedPr,
		{
			surface: { headCommit: H, files: sampleSurface },
			rulebook: rb,
		},
	);
	assert.equal(
		SubAgentController.from(workdir.data, subLedger, sampleChange)
			.workdir()
			.equals(workdir.data),
		true,
	);

	const unacked = sub.report([
		{
			rule: "Stated purpose",
			examined: ["a.ts"],
			verdict: "clean",
			evidence: "ok",
		},
	]);
	assert.equal(unacked.success, false);

	const ackResult = sub.ack();
	assert.equal(ackResult.deadlineMs, 300_000);
	assert.deepEqual(ackResult.permissions, [
		"Bash(node *sub-agent-controller.ts*)",
	]);

	const result = sub.report([
		{
			rule: "Stated purpose",
			examined: ["a.ts"],
			verdict: "clean",
			evidence: "ok",
		},
	]);
	assert.equal(result.success, true);
	assert.equal(result.data.kind, "recorded");

	const mainController = MainAgentController.create();
	const invalidPrep = await mainController.prepare("not-a-url", workdir.data);
	assert.equal(invalidPrep.success, false);
	assert.equal(invalidPrep.error.kind, "invalid-target");
});

it("SubAgentController.forWorkdir and forSession rehydrate a probe, enforce ack and 5-minute deadline, and hide workdir from subagents", async () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "controller-rehydrate-"));
	const workdir = Workdir.from(join(tempRoot, "workspace"));
	assert.equal(workdir.success, true);
	const rb = sampleRulebook();
	workdir.data.ledgerDirectory().writePullRequest({
		change: sampleChange,
		surface: { headCommit: H, files: sampleSurface },
		fragments: sampleFile.fragments,
		threads: { threads: [] },
	});
	workdir.data.writeAudit("01-purpose", {
		instructions: SubAgentController.forProbe(
			workdir.data,
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
		task: "Probe the pull request in review against every rule in ruleset.rules and report one row per rule. Work from this document alone",
		permissions: ["Bash(node *sub-agent-controller.ts*)"],
		kind: "rules",
		change: sampleChange,
		surface: { headCommit: H, files: sampleSurface },
		ruleset: rb.toRuleset(),
	});
	const sessionToken = workdir.data.sessionToken();
	assert.equal(sessionToken.includes(tempRoot), false);
	const resolvedFromSession = Workdir.fromSession(sessionToken);
	assert.equal(resolvedFromSession.success, true);
	assert.equal(resolvedFromSession.data.equals(workdir.data), true);

	const auditFile = join(
		workdir.data.toString(),
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

	let currentClock = 1000;
	const rehydratedSub = SubAgentController.forSession(
		sessionToken,
		"01-purpose",
		() => currentClock,
	);
	assert.deepEqual(rehydratedSub.change(), sampleChange);
	assert.deepEqual(rehydratedSub.codeUnderReview().surface(), sampleSurface);

	const beforeAck = rehydratedSub.report([
		{
			rule: "Stated purpose",
			examined: ["a.ts"],
			verdict: "clean",
			evidence: "stated",
		},
	]);
	assert.equal(beforeAck.success, false);

	const beforeAckMain = MainAgentController.create().ledger(workdir.data);
	assert.deepEqual(beforeAckMain.acknowledged(), []);
	assert.deepEqual(beforeAckMain.unacknowledged(), ["01-purpose"]);

	rehydratedSub.ack();
	const afterAckMain = MainAgentController.create().ledger(workdir.data);
	assert.deepEqual(afterAckMain.acknowledged(), ["01-purpose"]);
	assert.deepEqual(afterAckMain.unacknowledged(), []);

	currentClock = 1000 + 300_001;
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

	const freshMain = MainAgentController.create();
	const mainLedger = freshMain.ledger(workdir.data);
	assert.deepEqual(mainLedger.pending(), []);
	assert.deepEqual(mainLedger.completed(), ["01-purpose"]);
	assert.deepEqual(mainLedger.permissions("01-purpose"), [
		"Bash(node *sub-agent-controller.ts*)",
	]);
	assert.equal(mainLedger.submittedOutcome()?.verdict, "approve");

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
			"ack",
			sessionToken,
			"01-purpose",
			"Home-baked instructions from main agent",
		]),
		1,
	);
	process.exitCode = 0;
	assert.equal(
		runSubAgentCli(SubAgentController.forSession, [
			"ack",
			sessionToken,
			"01-purpose",
			bootstrapPrompt(sessionToken, "01-purpose"),
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
	assert.equal(
		await runMainAgentCli(freshMain, ["status", workdir.data.toString()]),
		0,
	);

	rmSync(tempRoot, { recursive: true, force: true });
});

it("Workdir immediately writes to establish it is operational, fails on unwriteable path, and warns when traversing a symlink", () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "workdir-operational-"));
	const realDir = join(tempRoot, "real-workspace");
	const symlinkDir = join(tempRoot, "symlink-workspace");
	const blockerFile = join(tempRoot, "not-a-dir");
	writeFileSync(blockerFile, "file", "utf8");

	const realWorkdir = Workdir.from(realDir);
	assert.equal(realWorkdir.success, true);
	assert.equal(existsSync(join(realDir, ".operational")), true);
	assert.equal(existsSync(join(tempRoot, "ledger", ".operational")), true);
	assert.equal(realWorkdir.data.isSymlinked(), false);
	assert.equal(realWorkdir.data.warning(), null);

	symlinkSync(realDir, symlinkDir);
	const linkedWorkdir = Workdir.from(symlinkDir);
	assert.equal(linkedWorkdir.success, true);
	assert.equal(linkedWorkdir.data.isSymlinked(), true);
	assert.equal(linkedWorkdir.data.warning()?.includes("symlink"), true);

	const unwriteableWorkdir = Workdir.from(join(blockerFile, "child"));
	assert.equal(unwriteableWorkdir.success, false);

	rmSync(tempRoot, { recursive: true, force: true });
});

it("controller CLIs support -h / --help with row schemas and execute correctly through symlinks", async () => {
	const freshMain = MainAgentController.create();
	assert.equal(await runMainAgentCli(freshMain, ["-h"]), 0);
	assert.equal(await runMainAgentCli(freshMain, ["--help"]), 0);
	assert.equal(runSubAgentCli(SubAgentController.forSession, ["-h"]), 0);
	assert.equal(runSubAgentCli(SubAgentController.forSession, ["--help"]), 0);

	const tempRoot = mkdtempSync(join(tmpdir(), "cli-symlink-"));
	const linkedSubCli = join(tempRoot, "sub-agent-controller.ts");
	symlinkSync(join(DOMAIN_DIR, "sub-agent-controller.ts"), linkedSubCli);
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
