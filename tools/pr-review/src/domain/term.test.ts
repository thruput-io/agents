import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { NotValid } from "./not-valid.ts";
import { Term } from "./term.ts";

const headCommit: Term = Effect.runSync(Term.of("Head commit"));

it("a term is the same whatever its case", () => {
	assert.equal(
		Effect.runSync(Term.of("HEAD COMMIT")).isSameAs(headCommit),
		true,
	);
});

it("a term is the same written with hyphens or underscores", () => {
	assert.deepEqual(
		[
			Effect.runSync(Term.of("head-commit")).isSameAs(headCommit),
			Effect.runSync(Term.of("head_commit")).isSameAs(headCommit),
		],
		[true, true],
	);
});

it("a term is the same inside quotes, backticks or double brackets", () => {
	assert.deepEqual(
		[
			Effect.runSync(Term.of('"Head commit"')).isSameAs(headCommit),
			Effect.runSync(Term.of("'Head commit'")).isSameAs(headCommit),
			Effect.runSync(Term.of("`Head commit`")).isSameAs(headCommit),
			Effect.runSync(Term.of("“Head commit”")).isSameAs(headCommit),
			Effect.runSync(Term.of("[[Head commit]]")).isSameAs(headCommit),
		],
		[true, true, true, true, true],
	);
});

it("a term is the same with spaces around it or doubled inside it", () => {
	assert.equal(
		Effect.runSync(Term.of("  Head   commit ")).isSameAs(headCommit),
		true,
	);
});

it("another term is not the same", () => {
	assert.equal(
		Effect.runSync(Term.of("Base commit")).isSameAs(headCommit),
		false,
	);
});

it("text that holds nothing but quotes and separators is no term", () => {
	assert.deepEqual(
		Effect.runSync(Effect.flip(Term.of("'' -- \"\""))),
		NotValid.create(),
	);
});
