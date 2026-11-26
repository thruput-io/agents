import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { NotValid } from "../generated/domain/not-valid.g.ts";
import { Probes } from "../generated/domain/probes.g.ts";
import { TargetUrl } from "../generated/domain/target-url.g.ts";
import { Workdir } from "../generated/domain/workdir.g.ts";
import {
	commandLineOf,
	prepareCommandOf,
	statusCommandOf,
} from "./command-line.ts";

it("the arguments of prepare give the target URL, the workdir and the probes", () => {
	const command = Effect.runSync(
		prepareCommandOf(["https://host.test/change", "/work"]),
	);

	assert.deepEqual(
		[
			TargetUrl.dataOf(command.url),
			Workdir.dataOf(command.workdir),
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

	assert.equal(Workdir.dataOf(workdir), "/work");
});

it("arguments of status of another shape are not valid", () => {
	const refused = Effect.runSync(Effect.flip(statusCommandOf([])));

	assert.equal(refused instanceof NotValid, true);
});

it("a command line gives the name and the arguments after it", () => {
	assert.deepEqual(Effect.runSync(commandLineOf(["prepare", "one", "two"])), {
		name: "prepare",
		commandArguments: ["one", "two"],
	});
});

it("an empty command line is not valid", () => {
	const refused = Effect.runSync(Effect.flip(commandLineOf([])));

	assert.equal(refused instanceof NotValid, true);
});
