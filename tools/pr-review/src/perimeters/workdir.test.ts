import assert from "node:assert/strict";
import { test as it } from "node:test";
import { placeOf, prepareDto, sessionOf, statusDto } from "./workdir.ts";

it("a workdir made from the prepare parameters is placed at their directory", () => {
	assert.deepEqual(placeOf(prepareDto({ workdir: "/work" }).toDomain()), {
		directory: "/work",
	});
});

it("the session of a workdir leads back to the same workdir", () => {
	const session = sessionOf(prepareDto({ workdir: "/work" }).toDomain());

	assert.deepEqual(placeOf(statusDto(session).toDomain()), {
		directory: "/work",
	});
});

it("prepare parameters with an empty workdir make no workdir", () => {
	assert.throws(
		(): ReturnType<typeof placeOf> =>
			placeOf(prepareDto({ workdir: "" }).toDomain()),
	);
});
