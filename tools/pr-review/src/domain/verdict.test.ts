import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { NotAssigned } from "../generated/domain/not-assigned.g.ts";
import { ruleSample } from "./sample.test-support.ts";
import { Verdict } from "./verdict.ts";

it("a verdict on one of the rules is among them", () => {
	const verdict: Verdict = Verdict.on(ruleSample("Stated purpose"));
	const among = verdict.among([ruleSample("Stated purpose")]);

	assert.equal(Effect.runSync(among), verdict);
});

it("a verdict on another rule is not assigned", () => {
	const among = Verdict.on(ruleSample("Delete unused")).among([
		ruleSample("Stated purpose"),
	]);

	assert.equal(Effect.runSync(Effect.flip(among)) instanceof NotAssigned, true);
});
