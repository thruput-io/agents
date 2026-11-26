import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { Acknowledgement } from "../generated/domain/acknowledgement.g.ts";
import { Progress } from "../generated/domain/progress.g.ts";
import { Assignment } from "./assignment.ts";
import { Briefing } from "./briefing.ts";
import { Cursor } from "./cursor.ts";

it("an assignment has a briefing", () => {
	assert.equal(Assignment.create().briefing() instanceof Briefing, true);
});

it("an assignment has a cursor", () => {
	assert.equal(Assignment.create().cursor() instanceof Cursor, true);
});

it("an assignment states its progress", () => {
	assert.equal(Assignment.create().progress() instanceof Progress, true);
});

it("an assignment accepts an acknowledgement", () => {
	const acknowledgement = Acknowledgement.create();
	const accepted = Assignment.create().accepted(acknowledgement);

	assert.equal(Effect.runSync(accepted), acknowledgement);
});

it("an assignment carries no data yet", () => {
	assert.deepEqual(Assignment.dataOf(Assignment.create()), {});
});
