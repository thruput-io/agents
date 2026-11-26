import assert from "node:assert/strict";
import { test as it } from "node:test";
import { targetUrlFrom, workdirFrom } from "../generated/domain/factory.g.ts";
import { targetUrlMark } from "../generated/domain/mark.g.ts";
import type { TargetUrl } from "../generated/domain/value.g.ts";
import { textOf } from "./text.ts";

it("a target URL gives back the text it was made from", () => {
	assert.equal(
		textOf(targetUrlFrom("https://host.test/change")),
		"https://host.test/change",
	);
});

it("a workdir gives back the text it was made from", () => {
	assert.equal(textOf(workdirFrom("/work")), "/work");
});

it("a value built by hand gives no text", () => {
	const byHand: TargetUrl = { [targetUrlMark]: targetUrlMark };

	assert.throws(() => textOf(byHand), TypeError);
});
