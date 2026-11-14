import assert from "node:assert/strict";
import { test as it } from "node:test";
import { z } from "zod";
import {
	DIFF_LINES,
	DIFF_TOO_LARGE,
	FILE_LINES,
	type IndexEntry,
	IndexSchema,
	isDoc,
	isLock,
	isTest,
	oversizedFiles,
	tooLarge,
	withText,
} from "./ruleset.ts";

const index = [
	{
		id: "ddd",
		title: "Domain-Driven Design",
		author: "Eric Evans",
		focus: "Domain Modeling",
		when_to_use: "Strategic modeling.",
		review_checklist: "Guard aggregates.",
		tree_url: "https://books.example/ddd",
		canonical_url:
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
	const bad = [{ ...index[0], canonical_url: "https://books.example/ddd.md" }];
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

it("tooLarge names every changed production file over the limit and refuses when total added lines exceed the diff limit, skipping tests, lockfiles, and docs", () => {
	const perFileCase = [
		{ path: "a.cs", lines: 1001, added: 50 },
		{ path: "b.cs", lines: 1000, added: 1550 },
		{ path: "c.cs", lines: 0, added: 0 },
		{ path: "a.test.cs", lines: 1350, added: 1350 },
		{ path: "tests/OrderTests.cs", lines: 1300, added: 1300 },
		{ path: "src/App.Tests/ServiceTests.cs", lines: 1250, added: 1250 },
		{ path: "poetry.lock", lines: 3404, added: 3404 },
		{ path: "package-lock.json", lines: 5000, added: 5000 },
		{ path: "README.md", lines: 1500, added: 1500 },
		{ path: "docs/architecture.yaml", lines: 1500, added: 1500 },
	];
	assert.deepEqual(tooLarge(perFileCase), [
		"a.cs is 1001 lines long, which breaks File too large",
	]);
	assert.deepEqual(oversizedFiles(perFileCase), ["a.cs"]);

	const diffLimitCase = [
		{ path: "a.cs", lines: 600, added: 600 },
		{ path: "b.cs", lines: 600, added: 600 },
		{ path: "c.cs", lines: 600, added: 401 },
		{ path: "docs/notes.txt", lines: 500, added: 500 },
	];
	assert.deepEqual(tooLarge(diffLimitCase), [DIFF_TOO_LARGE]);
	assert.deepEqual(oversizedFiles(diffLimitCase), ["a.cs", "b.cs", "c.cs"]);

	assert.deepEqual(tooLarge([]), []);
	assert.deepEqual(oversizedFiles([]), []);
	assert.equal(FILE_LINES, 1000);
	assert.equal(DIFF_LINES, 1600);
});

it("isTest identifies test files and directories while ignoring production code", () => {
	assert.equal(isTest("test/foo.cs"), true);
	assert.equal(isTest("tests/foo.cs"), true);
	assert.equal(isTest("src/MyProject.Tests/foo.cs"), true);
	assert.equal(isTest("foo.test.ts"), true);
	assert.equal(isTest("foo.spec.js"), true);
	assert.equal(isTest("foo_test.go"), true);
	assert.equal(isTest("test_foo.py"), true);
	assert.equal(isTest("OrderServiceTests.cs"), true);
	assert.equal(isTest("OrderServiceTest.cs"), true);
	assert.equal(isTest("contest.cs"), false);
	assert.equal(isTest("latest.js"), false);
	assert.equal(isTest("attest.ts"), false);
	assert.equal(isTest("service.cs"), false);
});

it("isLock identifies lock files while ignoring production code", () => {
	assert.equal(isLock("poetry.lock"), true);
	assert.equal(isLock("sub/poetry.lock"), true);
	assert.equal(isLock("package-lock.json"), true);
	assert.equal(isLock("pnpm-lock.yaml"), true);
	assert.equal(isLock("yarn.lock"), true);
	assert.equal(isLock("Cargo.lock"), true);
	assert.equal(isLock("Pipfile.lock"), true);
	assert.equal(isLock("packages.lock.json"), true);
	assert.equal(isLock("go.sum"), true);
	assert.equal(isLock("clock.py"), false);
	assert.equal(isLock("lock.py"), false);
	assert.equal(isLock("service.cs"), false);
});

it("isDoc identifies documentation files and the docs folder while ignoring production code", () => {
	assert.equal(isDoc("README.md"), true);
	assert.equal(isDoc("docs/architecture.md"), true);
	assert.equal(isDoc("docs/spec.yaml"), true);
	assert.equal(isDoc("sub/docs/diagram.svg"), true);
	assert.equal(isDoc("LICENSE"), true);
	assert.equal(isDoc("guide.rst"), true);
	assert.equal(isDoc("service.py"), false);
});
