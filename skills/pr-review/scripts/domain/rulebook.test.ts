import assert from "node:assert/strict";
import { test as it } from "node:test";
import {
	checkKinds,
	citation,
	kindOf,
	message,
	ours,
	partition,
	Rulebook,
	rulebook,
	SITE,
	slug,
} from "./rulebook.ts";

const DEAD_CODE_RE = /Dead Code/u;
const MISSING_PRINCIPLE_RE = /principle Missing/u;

it("slug derives the anchor the site uses", () => {
	assert.equal(slug("Demonstrable, not recalled"), "demonstrable-not-recalled");
	assert.equal(slug("You aren't gonna need it"), "you-arent-gonna-need-it");
	assert.equal(
		slug("Behavior & Failure Handling"),
		"behavior-failure-handling",
	);
});

it("partition groups rules in first-seen order and keeps rule order inside a group", () => {
	const rules = [
		{ id: "A", group: "G1" },
		{ id: "B", group: "G2" },
		{ id: "C", group: "G1" },
	];
	assert.deepEqual(partition(rules), [
		{ name: "g1", group: "G1", rules: [rules[0], rules[2]] },
		{ name: "g2", group: "G2", rules: [rules[1]] },
	]);
});

it("kindOf names the probe a group gets: reuse, dead code, or a probe of rules", () => {
	assert.equal(kindOf("Reuse"), "reuse");
	assert.equal(kindOf("Dead Code"), "dead-code");
	assert.equal(kindOf("Failure Handling"), "rules");
});

it("checkKinds refuses rules that lack a group a kind of probe is tied to", () => {
	assert.equal(
		checkKinds(["Reuse", "Dead Code", "Failure Handling"]),
		undefined,
	);
	assert.throws(() => checkKinds(["Reuse", "Failure Handling"]), DEAD_CODE_RE);
});

const governance = {
	principles: [
		{ id: "P", parent: "R", body: "Uses [[Term]]." },
		{ id: "Unused principle", parent: "R", body: "Unused." },
	],
};

it("rulebook hands a probe its rules and their principles without pre-baked definitions, and refuses an undeclared parent", () => {
	const own = [
		{
			id: "A",
			marker: "MUST" as const,
			group: "G1",
			parent: "P",
			body: "Do [[Rule term]].",
		},
		{
			id: "B",
			marker: "MUST" as const,
			group: "G1",
			parent: "P",
			body: "Do [[Rule term]].",
		},
	];
	assert.deepEqual(rulebook(own, governance), {
		instructions:
			"Apply each rule with its [[term]]s resolved via define. When the application of a rule is in doubt, its parent in principles decides",
		rules: own,
		principles: [governance.principles[0]],
	});
	assert.throws(
		() =>
			rulebook(
				[
					{
						id: "A",
						marker: "MUST",
						group: "G1",
						parent: "Missing",
						body: "Do [[Rule term]].",
					},
				],
				governance,
			),
		MISSING_PRINCIPLE_RE,
	);
});

it("Rulebook parses via RulebookSchema, exposes toRuleset, and iterates its rules in order", () => {
	const valid = Rulebook.slice(
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
	);
	assert.equal(valid.success, true);
	assert.deepEqual(
		[...valid.data].map((rule) => rule.id),
		["Stated purpose"],
	);
	assert.equal(valid.data.toRuleset().rules.length, 1);

	const invalid = Rulebook.from({ rules: [], principles: [] });
	assert.equal(invalid.success, false);
});

it("citation links the parent principle of a rule of ours on the site, and a book rule in its ruleset", () => {
	const document = {
		rulebook: { rules: [{ id: "R", parent: "You aren't gonna need it" }] },
	};
	assert.equal(
		citation(document, { rule: "R" }),
		`[You aren't gonna need it](${SITE}#you-arent-gonna-need-it)`,
	);
	assert.equal(
		citation(
			{ rulesets: [] },
			{
				bookRule: {
					ruleset: "https://books.example/ddd.md",
					heading: "Book rule",
				},
			},
		),
		"[Book rule](https://books.example/ddd.md)",
	);
});

it("message renders the observation as breaking what is cited", () => {
	const citeP = `[P](${SITE}#p)`;
	assert.equal(
		message({ observation: "what is wrong" }, citeP),
		`what is wrong breaks ${citeP}`,
	);
});

it("ours recognises our rendered findings and summaries", () => {
	const citeP = `[P](${SITE}#p)`;
	assert.equal(ours(`what is wrong breaks ${citeP}`), true);
	assert.equal(
		ours(
			"what is wrong breaks [Timeouts Are Mandatory](https://github.com/ciembor/agent-rules-books/blob/main/x.md)",
		),
		true,
	);
	assert.equal(
		ours(
			`**Verdict: approve**\n\n3 rules probed by 2 probes at h against [the rules](${SITE}): 0 violations`,
		),
		true,
	);
	assert.equal(ours("Policy status has been updated"), false);
	assert.equal(ours("LGTM, breaks nothing"), false);
});
