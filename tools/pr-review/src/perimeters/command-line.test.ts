import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { NotValid } from "../generated/domain/not-valid.g.ts";
import { Probes } from "../generated/domain/probes.g.ts";
import { prepareCommandOf, statusCommandOf } from "./command-line.ts";

it("the arguments of prepare give the target URL, the workdir and the probes", () => {
	const command = Effect.runSync(
		prepareCommandOf(["https://host.test/change", "/work"]),
	);

	assert.deepEqual(
		[
			command.url.toJSON(),
			command.workdir.toJSON(),
			command.probes instanceof Probes,
		],
		["https://host.test/change", "/work", true],
	);
});

it("arguments of prepare of another shape are not valid", () => {
	const refused = Effect.runSync(Effect.flip(prepareCommandOf(["one"])));

	assert.equal(refused instanceof NotValid, true);
});

it("an empty target URL is not valid", () => {
	const refused = Effect.runSync(Effect.flip(prepareCommandOf(["", "/work"])));

	assert.equal(refused instanceof NotValid, true);
});

it("the argument of status gives the workdir", () => {
	const workdir = Effect.runSync(statusCommandOf(["/work"]));

	assert.equal(workdir.toJSON(), "/work");
});

it("arguments of status of another shape are not valid", () => {
	const refused = Effect.runSync(Effect.flip(statusCommandOf([])));

	assert.equal(refused instanceof NotValid, true);
});
