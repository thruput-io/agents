import assert from "node:assert/strict";
import {
	existsSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as it } from "node:test";
import { MainAgentController } from "../controller/controller.ts";
import { SubAgentController } from "../controller/sub-agent-controller.ts";
import { CodeUnderReviewFactory } from "./code-under-review-factory.ts";
import { LedgerDirectory } from "./ledger-directory.ts";
import { nonnull } from "./nullish.ts";
import { Rulebook } from "./rulebook.ts";
import { RulesSubAgentLedger } from "./rules-sub-agent-ledger.ts";
import { Workdir } from "./workdir.ts";

const SHA1_HEX_LENGTH = 40;
const H = "a".repeat(SHA1_HEX_LENGTH);
const EXPECTED_PROSE_LENGTH = 9;
const FIVE_MINUTES_MS = 300_000;

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

const createReviewedPr = () => {
	const pr = nonnull(
		CodeUnderReviewFactory.from("https://github.com/thruput-io/agents/pull/14")
			.data,
	);
	return pr.withReview(sampleSurface, sampleFile.fragments, {
		threads: [],
	});
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

it("SubAgentController exposes instructions, change, rules, and codeUnderReview for its probe", () => {
	const workdir = nonnull(Workdir.from("/tmp/review/workspace").data);
	const rb = sampleRulebook();
	const reviewedPr = createReviewedPr();

	const sub = SubAgentController.forProbe(workdir, reviewedPr, {
		kind: "rules",
		change: sampleChange,
		surface: { headCommit: H, files: sampleSurface },
		rulebook: rb,
	});
	assert.equal(sub.workdir().equals(workdir), true);
	assert.deepEqual(sub.change(), sampleChange);
	assert.equal(sub.instructions().prose().length, EXPECTED_PROSE_LENGTH);
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
	assert.equal("checkout" in sub.inspect(), false);
	assert.equal("files" in sub.inspect().surface, false);
	assert.equal(sub.inspect().kind, "rules");
});

const probeFor = (
	kind: "rules" | "dead-code" | "reuse",
	workdir = nonnull(Workdir.from("/tmp/review/workspace").data),
) =>
	SubAgentController.forProbe(workdir, createReviewedPr(), {
		kind,
		change: sampleChange,
		surface: { headCommit: H, files: sampleSurface },
		rulebook: sampleRulebook(),
	});

it("SubAgentController sets probe-kind permissions and checkout paths", () => {
	const workdir = nonnull(Workdir.from("/tmp/review/workspace").data);
	const rulesSub = probeFor("rules", workdir);
	const contextSub = SubAgentController.forProbe(workdir, createReviewedPr(), {
		kind: "context",
		change: sampleChange,
		surface: { headCommit: H, files: sampleSurface },
		rulesets: [],
	});
	const deadCodeSub = probeFor("dead-code", workdir);
	const reuseSub = probeFor("reuse", workdir);
	assert.equal(contextSub.rules().kind, "rulesets");
	assert.deepEqual(rulesSub.instructions().permissions(), [
		"Bash(review-tool-probe*)",
	]);
	assert.deepEqual(contextSub.instructions().permissions(), [
		"Read",
		"Grep",
		"Glob",
		"Find",
		"Bash(review-tool-probe*)",
	]);
	assert.deepEqual(
		deadCodeSub.instructions().permissions(),
		contextSub.instructions().permissions(),
	);
	assert.deepEqual(reuseSub.instructions().permissions(), [
		"Read",
		"Grep",
		"Glob",
		"WebSearch",
		"WebFetch",
		"Bash(review-tool-probe*)",
	]);
	assert.equal(
		[contextSub, deadCodeSub, reuseSub].every(
			(sub) =>
				(sub.inspect() as { readonly checkout?: string }).checkout ===
				"/tmp/review/workspace/snapshot",
		),
		true,
	);
});

it("SubAgentController requires ack before report and MainAgentController rejects invalid targets", async () => {
	const workdir = nonnull(Workdir.from("/tmp/review/workspace").data);
	const rb = sampleRulebook();
	const reviewedPr = createReviewedPr();
	const sub = SubAgentController.forProbe(workdir, reviewedPr, {
		kind: "rules",
		change: sampleChange,
		surface: { headCommit: H, files: sampleSurface },
		rulebook: rb,
	});
	const subLedger = RulesSubAgentLedger.from(
		workdir.ledgerDirectory(),
		reviewedPr,
		{
			surface: { headCommit: H, files: sampleSurface },
			rulebook: rb,
		},
	);
	assert.equal(
		SubAgentController.from(workdir, subLedger, sampleChange)
			.workdir()
			.equals(workdir),
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
	const ackResult = sub.ack({
		message: "<SYSTEM_MESSAGE>Run inspect</SYSTEM_MESSAGE>",
		rulesInOrder: ["Stated purpose"],
		observationFormat: "<observation> breaks <principle>",
	});
	assert.equal(ackResult.success, true);
	assert.equal(ackResult.data.deadlineMs, FIVE_MINUTES_MS);
	assert.deepEqual(ackResult.data.permissions, ["Bash(review-tool-probe*)"]);
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
	const invalidPrep = await mainController.prepare("not-a-url", workdir);
	assert.equal(invalidPrep.success, false);
	assert.equal(invalidPrep.error.kind, "invalid-target");
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
	const linkedWorkdir = Workdir.open(symlinkDir);
	assert.equal(linkedWorkdir.success, true);
	assert.equal(linkedWorkdir.data.isSymlinked(), true);
	assert.equal(linkedWorkdir.data.warning()?.includes("symlink"), true);

	const staleLedgerFile = join(tempRoot, "ledger", "stale-slice.json");
	writeFileSync(staleLedgerFile, '{"stale":true}', "utf8");
	const refreshedWorkdir = Workdir.from(
		join(symlinkDir, "nested", "workspace"),
	);
	assert.equal(refreshedWorkdir.success, true);
	assert.equal(refreshedWorkdir.data.isSymlinked(), true);
	assert.equal(
		existsSync(join(symlinkDir, "nested", "ledger", "stale-slice.json")),
		false,
	);
	const parentWorkdir = Workdir.from(realDir);
	assert.equal(parentWorkdir.success, true);
	assert.equal(existsSync(staleLedgerFile), false);

	const unwriteableWorkdir = Workdir.from(join(blockerFile, "child"));
	assert.equal(unwriteableWorkdir.success, false);

	rmSync(tempRoot, { recursive: true, force: true });
});
