import assert from "node:assert/strict";
import { test as it } from "node:test";
import { isMinted, mint } from "./mint.ts";

it("a minted object is frozen", () => {
	assert.equal(Object.isFrozen(mint({})), true);
});

it("a minted object is known as minted", () => {
	assert.equal(isMinted(mint({})), true);
});

it("an object built by hand is not known as minted", () => {
	assert.equal(isMinted({}), false);
});
