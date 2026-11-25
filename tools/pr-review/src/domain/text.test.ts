import assert from "node:assert/strict";
import { test as it } from "node:test";
import type { TargetUrl } from "./domain.ts";
import { targetUrlFrom, workdirFrom } from "./factory.ts";
import { targetUrlMark } from "./mark.ts";
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
