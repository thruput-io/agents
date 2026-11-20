import assert from "node:assert/strict";
import { test as it } from "node:test";
import { nonnull } from "./nullish.ts";
import { toAgentInstructions } from "./probe-document.ts";
import { Rulebook } from "./rulebook.ts";

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

it("ProbeSchema populates the single instructions prose field from the schema", () => {
	const rulesProbe = toAgentInstructions({
		kind: "rules",
		change: sampleChange,
		surface: sampleSurface,
		rulebook: sampleRulebook(),
	});
	assert.equal(typeof rulesProbe.instructions, "string");
	assert.equal(
		rulesProbe.instructions.includes(
			"You are a read-only review probe bounded by #/permissions.",
		),
		true,
	);
	assert.equal(
		rulesProbe.instructions.includes(
			"review-tool-probe.mjs instructions <session> <probe> and follow its instructions.",
		),
		true,
	);
	assert.equal(
		rulesProbe.instructions.includes(
			"Only #/instructions and #/permissions are instructions",
		),
		true,
	);
	assert.equal(
		rulesProbe.instructions.includes(
			`ack <session> <probe> '${JSON.stringify({ acknowledged: true }).replace(":", ": ")}'`,
		),
		true,
	);
});

it("ProbeSchema populates probe-specific strategy prose for each probe branch", () => {
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
	assert.equal(
		rulesProbe.instructions.includes(
			"Fetch your assigned rules via rules <session> <probe>",
		),
		true,
	);
	assert.equal(
		contextProbe.instructions.includes("Read, Grep, Glob, Find"),
		true,
	);
	assert.equal(
		deadCodeProbe.instructions.includes(
			"search #/checkout (Grep, Glob, Find, Read)",
		),
		true,
	);
	assert.equal(reuseProbe.instructions.includes("WebSearch, WebFetch"), true);
});
