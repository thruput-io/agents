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

const EXPECTED_PROSE_LENGTH = 5;
const FIVE_MINUTES_MS = 300_000;

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

it("SubAgentController exposes instructions, change, rules, rulesPage, and ack assignment for its probe", () => {
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
	const acked = sub.ack().response;
	assert.equal(acked.instructions.length, EXPECTED_PROSE_LENGTH);
	assert.equal(acked.task.includes("report one row per rule"), true);
	assert.equal("checkout" in acked, false);
	assert.equal("files" in acked.surface, false);
	assert.equal(acked.kind, "rules");
	assert.deepEqual(acked.rulesOverview, {
		totalPages: 1,
		ruleIds: ["Stated purpose"],
	});
	const pageOne = sub.rulesPage(1);
	assert.equal(pageOne.success, true);
});

it("SubAgentController sets probe-kind permissions and checkout paths", () => {
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
	const rulesAck = rulesSub.ack().response;
	const contextAck = contextSub.ack().response;
	const deadCodeAck = deadCodeSub.ack().response;
	const reuseAck = reuseSub.ack().response;
	assert.deepEqual(rulesAck.permissions, ["Bash(review-tool-probe.mjs*)"]);
	assert.deepEqual(contextAck.permissions, [
		"Read",
		"Grep",
		"Glob",
		"Find",
		"Bash(review-tool-probe.mjs*)",
	]);
	assert.deepEqual(deadCodeAck.permissions, contextAck.permissions);
	assert.deepEqual(reuseAck.permissions, [
		"Read",
		"Grep",
		"Glob",
		"WebSearch",
		"WebFetch",
		"Bash(review-tool-probe.mjs*)",
	]);
	assert.equal(
		[contextAck, deadCodeAck, reuseAck].every(
			(ack) => ack.checkout === "/tmp/review/workspace/snapshot",
		),
		true,
	);
});

it("SubAgentController requires ack before report and MainAgentController rejects invalid targets", async () => {
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
