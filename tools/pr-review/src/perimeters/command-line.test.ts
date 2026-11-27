import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { NotValid } from "../domain/not-valid.ts";
import { ruleSample } from "../domain/sample.test-support.ts";
import {
	ackCommandOf,
	commandLineOf,
	defineCommandOf,
	prepareCommandOf,
	reportCommandOf,
	rulesCommandOf,
	statusCommandOf,
} from "./command-line.ts";
import { TermCodec } from "./term.ts";
import { AcknowledgementCodec, ProbeCodec, TargetUrlCodec } from "./values.ts";
import { placeOf } from "./workdir.ts";

const sentence =
	"By sending this ack I acknowledge I read all instructions and implicitly I know how to use the review tool";

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

it("the arguments of prepare give the target URL and the workdir", () => {
	const command = Effect.runSync(
		prepareCommandOf(["https://host.test/change", "/work"]),
	);

	assert.deepEqual(
		[TargetUrlCodec.encode(command.url), placeOf(command.workdir).directory],
		["https://host.test/change", "/work"],
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

it("the session given to status leads to the workdir it was made for", () => {
	const workdir = Effect.runSync(statusCommandOf(["L3dvcms"]));

	assert.equal(placeOf(workdir).directory, "/work");
});

it("the argument of a probe command gives the probe", () => {
	const probe = Effect.runSync(rulesCommandOf(["probe-1"]));

	assert.equal(ProbeCodec.encode(probe), "probe-1");
});

it("a probe command without its probe is not valid", () => {
	const refused = Effect.runSync(Effect.flip(rulesCommandOf([])));

	assert.equal(refused instanceof NotValid, true);
});

it("the arguments of define give the probe and the term", () => {
	const command = Effect.runSync(defineCommandOf(["probe-1", "[[Ledger]]"]));

	assert.deepEqual(
		[ProbeCodec.encode(command.probe), TermCodec.encode(command.term)],
		["probe-1", "ledger"],
	);
});

it("the sentence of ack is an acknowledgement", () => {
	const command = Effect.runSync(ackCommandOf(["probe-1", sentence]));
	const sent = Effect.runSync(command.sent);

	assert.equal(AcknowledgementCodec.encode(sent), sentence);
});

it("any other text of ack is no acknowledgement", () => {
	const command = Effect.runSync(ackCommandOf(["probe-1", "I read it"]));
	const refused = Effect.runSync(Effect.flip(command.sent));

	assert.equal(refused instanceof NotValid, true);
});

it("the arguments of report give the probe and a verdict on the rule", () => {
	const command = Effect.runSync(
		reportCommandOf(["probe-1", "Stated purpose"]),
	);

	assert.deepEqual(
		[
			ProbeCodec.encode(command.probe),
			command.verdict.isOn(ruleSample("Stated purpose")),
		],
		["probe-1", true],
	);
});
