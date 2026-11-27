import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { UnknownFormat } from "../domain/unknown-format.ts";
import { addressIn } from "./git-address.ts";

it("the three parts of an address are read", () => {
	const parts = {
		remote: "https://host.test/change.git",
		base: "main",
		head: "feature",
	};

	assert.deepEqual(Effect.runSync(addressIn(parts)), parts);
});

it("an address with a part missing is of an unknown format", () => {
	assert.deepEqual(
		Effect.runSync(Effect.flip(addressIn({ remote: "https://host.test" }))),
		UnknownFormat.create(),
	);
});

it("no parts at all is of an unknown format", () => {
	assert.deepEqual(
		Effect.runSync(Effect.flip(addressIn(undefined))),
		UnknownFormat.create(),
	);
});
