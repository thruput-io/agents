import assert from "node:assert/strict";
import { test as it } from "node:test";
import { sessionAt } from "./session.test-support.ts";
import {
	askedOf,
	createdAt,
	placeOf,
	placeUnder,
	prepareDto,
	statusDto,
} from "./session.ts";

const id = "00000000-0000-4000-8000-000000000000";

it("a review gets a directory of its own inside the workdir the agent chose", () => {
	const { session, directory } = placeUnder(
		prepareDto({ workdir: "/work" }).toDomain(),
	);

	assert.equal(directory, `/work/${session}`);
});

it("what status is asked with leads back to the same session", () => {
	const asked = askedOf(sessionAt("/work/review"));

	assert.deepEqual(placeOf(statusDto(asked).toDomain()), {
		session: id,
		directory: "/work/review",
	});
});

it("a place that is no directory makes no created directory", () => {
	assert.throws(
		(): ReturnType<typeof createdAt> =>
			createdAt({ session: id, directory: "" }),
	);
});
