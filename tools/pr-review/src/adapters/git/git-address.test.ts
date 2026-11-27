import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { UnknownFormat } from "../../domain/unknown-format.ts";
import { TargetUrlCodec } from "../../perimeters/values.ts";
import { workdirOf } from "../../perimeters/workdir.ts";
import { addressOf, repositoryIn } from "./git-address.ts";

it("an address names the remote, the base and the head", () => {
	const url = TargetUrlCodec.decode(
		"https://host.test/change.git@main..feature",
	);

	assert.deepEqual(Effect.runSync(addressOf(url)), {
		remote: "https://host.test/change.git",
		base: "main",
		head: "feature",
	});
});

it("an address without a range is of an unknown format", () => {
	const plain = TargetUrlCodec.decode("https://host.test/change");

	assert.deepEqual(
		Effect.runSync(Effect.flip(addressOf(plain))),
		UnknownFormat.create(),
	);
});

it("the repository is kept inside the workdir", () => {
	assert.equal(repositoryIn(workdirOf("/work")), "/work/repository.git");
});
