import assert from "node:assert/strict";
import { test as it } from "node:test";
import { z } from "zod";
import { type IndexEntry, IndexSchema, withText } from "./ruleset.ts";

const WHEN_TO_USE_KEY = "when_to_use";
const REVIEW_CHECKLIST_KEY = "review_checklist";
const TREE_URL_KEY = "tree_url";
const CANONICAL_URL_KEY = "canonical_url";

const index = [
	{
		id: "ddd",
		title: "Domain-Driven Design",
		author: "Eric Evans",
		focus: "Domain Modeling",
		[WHEN_TO_USE_KEY]: "Strategic modeling.",
		[REVIEW_CHECKLIST_KEY]: "Guard aggregates.",
		[TREE_URL_KEY]: "https://books.example/ddd",
		[CANONICAL_URL_KEY]:
			"https://github.com/ciembor/agent-rules-books/blob/main/ddd/ddd.md",
	},
] as const;

const firstEntry = (): IndexEntry =>
	z.tuple([IndexSchema.element]).decode([index[0]])[0];

it("an index entry is read from its canonical GitHub file and fetched from its raw address", () => {
	const entry = firstEntry();
	assert.deepEqual(entry, {
		url: "https://github.com/ciembor/agent-rules-books/blob/main/ddd/ddd.md",
		rawUrl:
			"https://raw.githubusercontent.com/ciembor/agent-rules-books/main/ddd/ddd.md",
		title: "Domain-Driven Design",
		focus: "Domain Modeling",
		whenToUse: "Strategic modeling.",
	});
});

it("an index entry that is not a file on github.com is refused with the reason", () => {
	const bad = [
		{ ...index[0], [CANONICAL_URL_KEY]: "https://books.example/ddd.md" },
	];
	assert.throws(
		() => IndexSchema.decode(bad),
		(error: Error) =>
			z
				.prettifyError(error as z.ZodError)
				.includes("is not a file on github.com"),
	);
});

it("a ruleset is the index entry with the text read for it, and no text is no ruleset", () => {
	const entry = firstEntry();
	assert.deepEqual(withText(entry, "# Rules"), {
		url: entry.url,
		title: entry.title,
		focus: entry.focus,
		whenToUse: entry.whenToUse,
		text: "# Rules",
	});
	assert.throws(() => withText(entry, ""));
});
