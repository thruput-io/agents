import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Instructions, instructions } from "./instructions.ts";
import { nonnull } from "./nullish.ts";
import { Rulebook } from "./rulebook.ts";

const SHA1_HEX_LENGTH = 40;
const H = "a".repeat(SHA1_HEX_LENGTH);

function buildInstructionsFixture() {
	const change = {
		host: {
			kind: "github" as const,
			owner: "thruput-io",
			repository: "agents",
			number: 14,
		},
		author: "author",
		description: "Body",
	};
	const surface = { headCommit: H, changedFiles: 0, totalPages: 0 };
	const context = {
		change,
		surface: { headCommit: H, files: [] },
		checkout: "/w/snapshot",
	};
	const rb = nonnull(
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
	const rulesets = [
		{
			url: "https://raw.githubusercontent.com/ciembor/agent-rules-books/main/ddd.md",
			title: "DDD",
			focus: "Domain Modeling",
			whenToUse: "Domain logic.",
			text: "# R1\nUse domain terms.",
		},
	];
	const rulesetSummaries = [
		{
			url: "https://raw.githubusercontent.com/ciembor/agent-rules-books/main/ddd.md",
			title: "DDD",
			focus: "Domain Modeling",
			whenToUse: "Domain logic.",
			totalPages: 1,
		},
	];
	return { change, surface, context, rb, rulesets, rulesetSummaries };
}

it("instructions hands every probe its instructions, task, change, surface overview, rulebook or rulesets summary, and checkout where needed", () => {
	const { change, surface, context, rb, rulesets, rulesetSummaries } =
		buildInstructionsFixture();
	const probes = [
		{ name: "g1", kind: "rules" as const, rulebook: rb },
		{ name: "g2", kind: "reuse" as const, rulebook: rb },
		{ name: "g3", kind: "dead-code" as const, rulebook: rb },
	];
	const files = instructions(context, probes, rulesets);
	assert.deepEqual(
		files.map((file) => file.name),
		["01-g1", "02-g2", "03-g3", "04-context"],
	);
	assert.deepEqual(files[0]?.document, {
		instructions: Instructions.forKind("rules").prose(),
		task: Instructions.forKind("rules").task(),
		permissions: Instructions.forKind("rules").permissions(),
		kind: "rules",
		change,
		surface,
		rulebook: rb,
	});
	assert.deepEqual(files[1]?.document, {
		instructions: Instructions.forKind("reuse").prose(),
		task: Instructions.forKind("reuse").task(),
		permissions: Instructions.forKind("reuse").permissions(),
		kind: "reuse",
		change,
		surface,
		rulebook: rb,
		checkout: "/w/snapshot",
	});
	assert.deepEqual(files[2]?.document, {
		instructions: Instructions.forKind("dead-code").prose(),
		task: Instructions.forKind("dead-code").task(),
		permissions: Instructions.forKind("dead-code").permissions(),
		kind: "dead-code",
		change,
		surface,
		rulebook: rb,
		checkout: "/w/snapshot",
	});
	assert.deepEqual(files[3]?.document, {
		instructions: Instructions.forKind("context").prose(),
		task: Instructions.forKind("context").task(),
		permissions: Instructions.forKind("context").permissions(),
		kind: "context",
		change,
		surface,
		rulesets: rulesetSummaries,
		checkout: "/w/snapshot",
	});
});
