import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Acknowledgement } from "../generated/domain/acknowledgement.g.ts";
import { Back } from "../generated/domain/back.g.ts";
import { Forward } from "../generated/domain/forward.g.ts";
import { HostError } from "../generated/domain/host-error.g.ts";
import { Posted } from "../generated/domain/posted.g.ts";
import { RecordingShape } from "./recording.ts";
import { probeSample, ruleSample } from "./sample.test-support.ts";
import { Verdict } from "./verdict.ts";

const probe = probeSample("probe-1");
const sentence =
	"By sending this ack I acknowledge that I have read all instructions, and implicitly that I know how to use the review tool.";

it("each thing recorded is written out in a form of its own", () => {
	const written = [
		Acknowledgement.codec.decode(sentence),
		Verdict.on(ruleSample("Stated purpose")),
		Forward.create(),
		Back.create(),
		Posted.create(),
		HostError.create(),
	].map((recorded) => RecordingShape.encode({ probe, recorded }));

	assert.deepEqual(written, [
		{ probe: "probe-1", recorded: { acknowledgement: sentence } },
		{ probe: "probe-1", recorded: { verdict: { rule: "Stated purpose" } } },
		{ probe: "probe-1", recorded: "forward" },
		{ probe: "probe-1", recorded: "back" },
		{ probe: "probe-1", recorded: "posted" },
		{ probe: "probe-1", recorded: "host-error" },
	]);
});

it("each thing recorded is read back as what it was", () => {
	const read = [
		{ acknowledgement: sentence },
		{ verdict: { rule: "Stated purpose" } },
		"forward",
		"back",
		"posted",
		"host-error",
	].map(
		(recorded) =>
			RecordingShape.parse({ probe: "probe-1", recorded }).recorded.constructor,
	);

	assert.deepEqual(read, [
		Acknowledgement,
		Verdict,
		Forward,
		Back,
		Posted,
		HostError,
	]);
});

it("something that was never recorded is not read", () => {
	const read = RecordingShape.safeParse({
		probe: "probe-1",
		recorded: "sideways",
	});

	assert.equal(read.success, false);
});
