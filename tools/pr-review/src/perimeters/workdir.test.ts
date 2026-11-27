import assert from "node:assert/strict";
import { test as it } from "node:test";
import { pathOf, workdirOf } from "./workdir.ts";

it("a workdir gives back the path it was made from", () => {
	assert.equal(pathOf(workdirOf("/work")), "/work");
});

it("an empty path is no workdir", () => {
	assert.throws((): string => pathOf(workdirOf("")));
});
