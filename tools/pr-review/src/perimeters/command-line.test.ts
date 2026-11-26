import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { Acknowledgement } from "../generated/domain/acknowledgement.g.ts";
import { NotValid } from "../generated/domain/not-valid.g.ts";
import { Probe } from "../generated/domain/probe.g.ts";
import { Probes } from "../generated/domain/probes.g.ts";
import { TargetUrl } from "../generated/domain/target-url.g.ts";
import { Term } from "../generated/domain/term.g.ts";
import { Workdir } from "../generated/domain/workdir.g.ts";
import {
	ackCommandOf,
	commandLineOf,
	defineCommandOf,
	prepareCommandOf,
	rulesCommandOf,
	statusCommandOf,
} from "./command-line.ts";

it("the arguments of prepare give the target URL, the workdir and the probes", () => {
	const command = Effect.runSync(
		prepareCommandOf(["https://host.test/change", "/work"]),
	);

	assert.deepEqual(
		[
			TargetUrl.codec.encode(command.url),
			Workdir.codec.encode(command.workdir),
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

	assert.equal(Workdir.codec.encode(workdir), "/work");
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

it("the argument of a probe command gives the probe", () => {
	const probe = Effect.runSync(rulesCommandOf(["probe-1"]));

	assert.equal(Probe.codec.encode(probe), "probe-1");
});

it("a probe command without its probe is not valid", () => {
	const refused = Effect.runSync(Effect.flip(rulesCommandOf([])));

	assert.equal(refused instanceof NotValid, true);
});

it("the arguments of define give the probe and the term", () => {
	const command = Effect.runSync(defineCommandOf(["probe-1", "Ledger"]));

	assert.deepEqual(
		[Probe.codec.encode(command.probe), Term.codec.encode(command.term)],
		["probe-1", "Ledger"],
	);
});

it("define without a term is not valid", () => {
	const refused = Effect.runSync(Effect.flip(defineCommandOf(["probe-1"])));

	assert.equal(refused instanceof NotValid, true);
});

it("the arguments of ack give the probe and the acknowledgement", () => {
	const command = Effect.runSync(ackCommandOf(["probe-1", "the phrase"]));

	assert.deepEqual(
		[
			Probe.codec.encode(command.probe),
			Acknowledgement.codec.encode(command.acknowledgement),
		],
		["probe-1", "the phrase"],
	);
});

it("ack without an acknowledgement is not valid", () => {
	const refused = Effect.runSync(Effect.flip(ackCommandOf(["probe-1"])));

	assert.equal(refused instanceof NotValid, true);
});
