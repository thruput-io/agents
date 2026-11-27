import assert from "node:assert/strict";
import { test as it } from "node:test";
import { HostError } from "../domain/host-error.ts";
import { Posted } from "../domain/posted.ts";
import { ruleSample, sessionSample } from "../domain/sample.test-support.ts";
import { askedOf } from "./session.ts";
import { statusAnswer } from "./status-answer.ts";

const { session } = askedOf(sessionSample());

it("a status says what is left, that nothing was posted, and the session", () => {
	const answer = statusAnswer(sessionSample())({
		remaining: [ruleSample("A rule")],
		posts: [],
	});

	assert.deepEqual(answer, {
		session,
		remaining: ["A rule"],
		posted: false,
		postFailed: false,
	});
});

it("a status says that the review was posted", () => {
	const answer = statusAnswer(sessionSample())({
		remaining: [],
		posts: [Posted.create()],
	});

	assert.deepEqual(answer, {
		session,
		remaining: [],
		posted: true,
		postFailed: false,
	});
});

it("a status says that posting failed", () => {
	const answer = statusAnswer(sessionSample())({
		remaining: [],
		posts: [HostError.create()],
	});

	assert.deepEqual(answer, {
		session,
		remaining: [],
		posted: false,
		postFailed: true,
	});
});
