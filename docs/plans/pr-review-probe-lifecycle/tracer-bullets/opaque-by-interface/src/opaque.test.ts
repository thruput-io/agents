import assert from "node:assert/strict";
import { test as it } from "node:test";
import { assign } from "./controller.ts";
import { dataOfAssignment } from "./internal.ts";
import { ChangeCodec, ProbeCodec } from "./perimeter.ts";

const wireChange = { author: "octocat", description: "Tidy the parser" };
const wireProbe = { name: "dead-code", group: "Dead Code" };

it("a change parsed at the perimeter encodes back to the same wire object", () => {
	const change = ChangeCodec.parse(wireChange);

	assert.deepEqual(ChangeCodec.encode(change), wireChange);
});

it("a change takes a probe and returns an assignment built from both", () => {
	const { author, probe, group } = dataOfAssignment(
		assign(ChangeCodec.parse(wireChange), ProbeCodec.parse(wireProbe)),
	);

	assert.deepEqual(
		{ author, probe, group },
		{ author: "octocat", probe: "dead-code", group: "Dead Code" },
	);
});

it("two assignments of the same author and probe are the same", () => {
	const first = assign(
		ChangeCodec.parse(wireChange),
		ProbeCodec.parse(wireProbe),
	);
	const second = assign(
		ChangeCodec.parse(wireChange),
		ProbeCodec.parse(wireProbe),
	);

	assert.equal(first.sameAs(second), true);
});

it("parsing rejects a change without an author", () => {
	const parsed = ChangeCodec.safeParse({ author: "", description: "x" });

	assert.equal(parsed.success, false);
});

it("encoding rejects an object the domain did not mint", () => {
	const forged = Object.freeze({ ...wireChange, assignedTo: () => forged });

	assert.throws(() => ChangeCodec.encode(forged as never));
});

it("a minted change cannot be altered", () => {
	const change = ChangeCodec.parse(wireChange);

	assert.equal(Object.isFrozen(change), true);
});
