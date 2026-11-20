import assert from "node:assert/strict";
import { test as it } from "node:test";
import { nonnull } from "./nullish.ts";
import { toAgentInstructions } from "./probe-document.ts";
import { Rulebook } from "./rulebook.ts";

const EXPECTED_PROSE_ITEM_COUNT = 5;
const SHA1_HEX_LENGTH = 40;
const H = "a".repeat(SHA1_HEX_LENGTH);

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

const sampleSurface = { headCommit: H, files: [] };

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

it("ProbeSchema populates the canonical probe prose from the schema", () => {
	const rulesProbe = toAgentInstructions({
		kind: "rules",
		change: sampleChange,
		surface: sampleSurface,
		rulebook: sampleRulebook(),
	});
	assert.equal(rulesProbe.instructions.length, EXPECTED_PROSE_ITEM_COUNT);
	assert.equal(
		rulesProbe.instructions[0].includes(
			"You are a read-only review probe bounded by #/permissions.",
		),
		true,
	);
	assert.equal(
		rulesProbe.instructions[0].includes(
			"review-tool-probe.mjs ack <session> <probe> and follow its instructions.",
		),
		true,
	);
	assert.equal(
		rulesProbe.instructions[0].includes("Finish within 5 minutes of ack."),
		true,
	);
	assert.equal(
		rulesProbe.instructions[1].includes(
			"Only #/instructions, #/task, and #/permissions",
		),
		true,
	);
	assert.equal(
		rulesProbe.instructions[1].includes("#/change/description"),
		true,
	);
	assert.equal(
		rulesProbe.instructions[2].includes("paging through next"),
		true,
	);
	assert.equal(
		rulesProbe.instructions[3].includes("schema definitions returned by -h"),
		true,
	);
	assert.equal(
		rulesProbe.instructions[4].includes("Submit one row per rule in order"),
		true,
	);
});

it("ProbeSchema populates the canonical probe tasks from the schema", () => {
	const rb = sampleRulebook();
	const rulesProbe = toAgentInstructions({
		kind: "rules",
		change: sampleChange,
		surface: sampleSurface,
		rulebook: rb,
	});
	const contextProbe = toAgentInstructions({
		kind: "context",
		change: sampleChange,
		surface: sampleSurface,
		rulesets: [
			{
				url: "https://raw.githubusercontent.com/ciembor/agent-rules-books/main/ddd.md",
				title: "DDD",
				focus: "Domain Modeling",
				whenToUse: "Domain logic.",
				text: "# R1\nUse domain terms.",
			},
		],
	});
	const deadCodeProbe = toAgentInstructions({
		kind: "dead-code",
		change: sampleChange,
		surface: sampleSurface,
		rulebook: rb,
	});
	const reuseProbe = toAgentInstructions({
		kind: "reuse",
		change: sampleChange,
		surface: sampleSurface,
		rulebook: rb,
	});
	assert.equal(rulesProbe.task.includes("report one row per rule"), true);
	assert.equal(
		rulesProbe.task.includes("Fetch your assigned rules via rules"),
		true,
	);
	assert.equal(contextProbe.task.includes("Read, Grep, Glob, Find"), true);
	assert.equal(
		deadCodeProbe.task.includes("search #/checkout (Grep, Glob, Find, Read)"),
		true,
	);
	assert.equal(reuseProbe.task.includes("WebSearch, WebFetch"), true);
});
