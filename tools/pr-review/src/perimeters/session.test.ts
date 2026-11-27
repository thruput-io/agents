import assert from "node:assert/strict";
import { test as it } from "node:test";
import { sessionAt } from "./session.test-support.ts";
import { askedOf, placeOf, prepareDto, statusDto } from "./session.ts";

it("a session made by prepare is kept in a folder of its own inside the workdir", () => {
	const { session, directory } = placeOf(
		prepareDto({ workdir: "/work" }).toDomain(),
	);

	assert.equal(directory, `/work/${session}`);
});

it("what status is asked with leads back to the same session", () => {
	const asked = askedOf(sessionAt("/work/review"));

	assert.deepEqual(placeOf(statusDto(asked).toDomain()), {
		session: "00000000-0000-4000-8000-000000000000",
		directory: "/work/review",
	});
});

it("prepare parameters with an empty workdir make no session", () => {
	assert.throws(
		(): ReturnType<typeof placeOf> =>
			placeOf(prepareDto({ workdir: "" }).toDomain()),
	);
});
