import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Term } from "./term.ts";

const headCommit: Term = Term.codec.decode("Head commit");

it("a term is the same whatever its case", () => {
	assert.equal(Term.codec.decode("HEAD COMMIT").isSameAs(headCommit), true);
});

it("a term is the same written with hyphens or underscores", () => {
	assert.deepEqual(
		[
			Term.codec.decode("head-commit").isSameAs(headCommit),
			Term.codec.decode("head_commit").isSameAs(headCommit),
		],
		[true, true],
	);
});

it("a term is the same inside quotes, backticks or double brackets", () => {
	assert.deepEqual(
		[
			Term.codec.decode('"Head commit"').isSameAs(headCommit),
			Term.codec.decode("'Head commit'").isSameAs(headCommit),
			Term.codec.decode("`Head commit`").isSameAs(headCommit),
			Term.codec.decode("“Head commit”").isSameAs(headCommit),
			Term.codec.decode("[[Head commit]]").isSameAs(headCommit),
		],
		[true, true, true, true, true],
	);
});

it("a term is the same with spaces around it or doubled inside it", () => {
	assert.equal(
		Term.codec.decode("  Head   commit ").isSameAs(headCommit),
		true,
	);
});

it("another term is not the same", () => {
	assert.equal(Term.codec.decode("Base commit").isSameAs(headCommit), false);
});

it("text that holds nothing but quotes and separators is no term", () => {
	assert.equal(Term.codec.safeDecode("'' -- \"\"").success, false);
});

it("a term is encoded in its normalized form", () => {
	assert.equal(Term.codec.encode(headCommit), "head-commit");
});
