import assert from "node:assert/strict";
import { test as it } from "node:test";
import { TermCodec } from "./term.ts";

it("a term is encoded in its normalized form", () => {
	assert.equal(
		TermCodec.encode(TermCodec.decode("Head commit")),
		"head-commit",
	);
});

it("text that holds nothing but quotes and separators is not decoded", () => {
	assert.equal(TermCodec.safeDecode("'' -- \"\"").success, false);
});
