import assert from "node:assert/strict";
import { test as it } from "node:test";
import { MainAgentController } from "./controller.ts";
import { LedgerDirectory } from "./ledger-directory.ts";
import { nonnull } from "./nullish.ts";
import { CodeUnderReviewFactory } from "./review-snapshot.ts";
import { Rulebook } from "./rulebook.ts";
import { SubAgentController } from "./sub-agent-controller.ts";
import { RulesSubAgentLedger } from "./sub-agent-ledger.ts";
import { Workdir } from "./workdir.ts";

const H = "a".repeat(40);

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
			lines: { 1: "const x = 1;" },
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
