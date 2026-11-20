import assert from "node:assert/strict";
import { test as it } from "node:test";
import type { WorkspacePort } from "../domain/ports.ts";
import type { Rulebook } from "../domain/rulebook.ts";
import { RulesSubAgentLedger } from "../domain/rules-sub-agent-ledger.ts";
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
	const acked = sub.ack().response;
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
		rulesets: [],
	});
	const deadCodeSub = probeFor("dead-code", workdir);
	const reuseSub = probeFor("reuse", workdir);
	assert.equal(contextSub.rules().kind, "rulesets");
	assert.deepEqual(rulesSub.instructions().permissions(), [
		"Bash(/opt/pr-review/dist/bin/review-tool-probe.mjs*)",
	]);
	assert.deepEqual(contextSub.instructions().permissions(), [
		"Read",
		"Grep",
		"Glob",
		"Find",
		"Bash(/opt/pr-review/dist/bin/review-tool-probe.mjs*)",
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
		"Bash(/opt/pr-review/dist/bin/review-tool-probe.mjs*)",
	]);
	assert.equal(
		[contextSub, deadCodeSub, reuseSub].every(
			(sub) => sub.ack().response.checkout === "/tmp/review/workspace/snapshot",
		),
		true,
	);
});

it("SubAgentController requires ack before report and MainAgentController rejects invalid targets", async () => {
	const workdir = createMemoryWorkspace("/tmp/review/workspace");
	const sub = probeFor("rules", workdir);
	const subLedger = RulesSubAgentLedger.from(
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
		"Bash(/opt/pr-review/dist/bin/review-tool-probe.mjs*)",
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
