import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import {
	notYetImplementedAgent,
	notYetImplementedHost,
} from "./not-yet-implemented.ts";

it("the host stops on get change", () => {
	assert.throws(
		(): never => Effect.runSync(notYetImplementedHost.getChange()),
		{ message: "not yet implemented: Host.getChange" },
	);
});

it("the host stops on post", () => {
	assert.throws((): never => Effect.runSync(notYetImplementedHost.post()), {
		message: "not yet implemented: Host.post",
	});
});

it("the agent stops on spawn", () => {
	assert.throws((): never => Effect.runSync(notYetImplementedAgent.spawn()), {
		message: "not yet implemented: Agent.spawn",
	});
});

it("the agent stops on terminate", () => {
	assert.throws(
		(): never => Effect.runSync(notYetImplementedAgent.terminate()),
		{ message: "not yet implemented: Agent.terminate" },
	);
});
