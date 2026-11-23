import assert from "node:assert/strict";
import { test as it } from "node:test";
import type { WorkspacePort } from "../domain/ports.ts";
import { ProbeLedger } from "../domain/probe-ledger.ts";
import type { Rulebook } from "../domain/rulebook.ts";
import { MainAgentController } from "./controller.ts";
import {
	createReviewedPr,
	createStubAdapterPort,
	createStubLoadProbes,
	defaultStubAdapter,
	H,
	sampleChange,
	sampleRulebook,
	sampleSurface,
} from "./controller-fixtures.test.ts";
import { createMemoryWorkspace } from "./memory-workspace.test.ts";
import { SubAgentController } from "./sub-agent-controller.ts";

const FIVE_MINUTES_MS = 300_000;
const SIX_MINUTES_MS = 360_000;

const probeFor = (
	kind: "rules" | "dead-code" | "reuse",
	workdir: WorkspacePort,
) =>
	SubAgentController.forProbe(workdir, createReviewedPr(), {
		kind,
		change: sampleChange,
		surface: { headCommit: H, files: sampleSurface },
		rulebook: sampleRulebook(),
	});

it("SubAgentController exposes instructions, ack, and rules for its probe", () => {
	const workdir = createMemoryWorkspace("/tmp/review/workspace");
	const sub = probeFor("rules", workdir);
	assert.equal(sub.workdir().equals(workdir), true);
	assert.deepEqual(sub.change(), sampleChange);
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
	const inst = sub.instructions();
	assert.equal(inst.success, true);
	assert.equal(inst.instructions.includes("ack <session> <probe>"), true);
	assert.equal("checkout" in inst, false);
	assert.equal("kind" in inst, false);
	assert.equal("task" in inst, false);
	assert.equal(sub.rulesResponse().success, false);
	const acked = sub.ack().response;
	assert.equal(acked.acknowledged, true);
	assert.equal(acked.deadlineMs, FIVE_MINUTES_MS);
	const rulesRes = sub.rulesResponse();
	assert.equal(rulesRes.success, true);
});

it("SubAgentController sets probe permissions, deadlines, and checkout paths on instructions", () => {
	const workdir = createMemoryWorkspace("/tmp/review/workspace");
	const rulesSub = probeFor("rules", workdir);
	const contextSub = SubAgentController.forProbe(workdir, createReviewedPr(), {
		kind: "context",
		change: sampleChange,
		surface: { headCommit: H, files: sampleSurface },
		rulesets: [
			{
				url: "https://raw.githubusercontent.com/ciembor/agent-rules-books/main/ddd.md",
				title: "DDD",
				focus: "Domain",
				whenToUse: "Domain",
				text: "# R1",
			},
		],
	});
	const deadCodeSub = probeFor("dead-code", workdir);
	const reuseSub = probeFor("reuse", workdir);
	assert.equal(contextSub.rules().kind, "rulesets");
	const rulesInst = rulesSub.instructions();
	const contextInst = contextSub.instructions();
	const deadCodeInst = deadCodeSub.instructions();
	const reuseInst = reuseSub.instructions();
	assert.deepEqual(rulesInst.permissions, ["Bash(review-tool-probe.mjs*)"]);
	assert.deepEqual(contextInst.permissions, [
		"Read",
		"Grep",
		"Glob",
		"Find",
		"Bash(review-tool-probe.mjs*)",
	]);
	assert.deepEqual(deadCodeInst.permissions, contextInst.permissions);
	assert.deepEqual(reuseInst.permissions, [
		"Read",
		"Grep",
		"Glob",
		"WebSearch",
		"WebFetch",
		"Bash(review-tool-probe.mjs*)",
	]);
	assert.equal(rulesInst.deadlineMs, FIVE_MINUTES_MS);
	assert.equal(reuseInst.deadlineMs, FIVE_MINUTES_MS);
	assert.equal(contextInst.deadlineMs, SIX_MINUTES_MS);
	assert.equal(deadCodeInst.deadlineMs, SIX_MINUTES_MS);
	assert.equal(
		[contextInst, deadCodeInst, reuseInst].every(
			(inst) => inst.checkout === "/tmp/review/workspace/snapshot",
		),
		true,
	);
});

it("SubAgentController requires ack before rules, next, prev, and report and MainAgentController rejects invalid targets", async () => {
	const workdir = createMemoryWorkspace("/tmp/review/workspace");
	const sub = probeFor("rules", workdir);
	const subLedger = ProbeLedger.from(
		workdir.ledgerDirectory(),
		createReviewedPr(),
		{
			surface: { headCommit: H, files: sampleSurface },
			rulebook: sampleRulebook(),
		},
	);
	assert.equal(
		SubAgentController.from(workdir, subLedger, sampleChange)
			.workdir()
			.equals(workdir),
		true,
	);
	const cleanRow = {
		rule: "Stated purpose",
		examined: ["a.ts"],
		verdict: "clean" as const,
		evidence: "ok",
	};
	assert.equal(sub.next().success, false);
	assert.equal(sub.prev().success, false);
	assert.equal(sub.report([cleanRow]).success, false);
	const ackResult = sub.ack();
	assert.equal(ackResult.success, true);
	assert.equal(ackResult.data.deadlineMs, FIVE_MINUTES_MS);
	assert.deepEqual(ackResult.data.permissions, [
		"Bash(review-tool-probe.mjs*)",
	]);
	const result = sub.report([cleanRow]);
	assert.equal(result.success, true);
	assert.equal(result.data.kind, "recorded");
	const mainController = MainAgentController.create(
		createStubAdapterPort(defaultStubAdapter),
		createStubLoadProbes(),
	);
	const invalidPrep = await mainController.prepare("not-a-url", workdir);
	assert.equal(invalidPrep.success, false);
	assert.equal(invalidPrep.error.kind, "invalid-target");
});
