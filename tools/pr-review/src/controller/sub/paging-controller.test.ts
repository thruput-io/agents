import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { probeFrom, surfaceFrom } from "../../domain/factory.ts";
import {
	assignmentFrom,
	pendingReviewFrom,
} from "../../domain/minted-review.ts";
import type { Assignment, Cursor, ReviewStore } from "../../domain/review.ts";
import { PagingController } from "./paging-controller.ts";

const following = surfaceFrom();
const preceding = surfaceFrom();
const cursor: Cursor = {
	...assignmentFrom().cursor(),
	next: () => following,
	previous: () => preceding,
};
const assignment: Assignment = { ...assignmentFrom(), cursor: () => cursor };

const store: ReviewStore = {
	save: () => Effect.succeed(pendingReviewFrom()),
	inWorkdir: () => Effect.succeed(pendingReviewFrom()),
	ofProbe: () => Effect.succeed(assignment),
	append: () => Effect.succeed(pendingReviewFrom()),
};

it("next answers the next page", () => {
	const answered = PagingController.over(store).next(probeFrom());

	assert.equal(Effect.runSync(answered), following);
});

it("prev answers the previous page", () => {
	const answered = PagingController.over(store).prev(probeFrom());

	assert.equal(Effect.runSync(answered), preceding);
});
