import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { Assignment } from "../../domain/assignment.ts";
import { PendingReview } from "../../domain/pending-review.ts";
import type { ReviewStore } from "../../domain/review.ts";
import { Probe } from "../../generated/domain/probe.g.ts";
import { Surface } from "../../generated/domain/surface.g.ts";
import { PagingController } from "./paging-controller.ts";

const store: ReviewStore = {
	save: (_workdir, review) => Effect.succeed(review),
	inWorkdir: () => Effect.succeed(PendingReview.create()),
	ofProbe: () => Effect.succeed(Assignment.create()),
	append: () => Effect.succeed(PendingReview.create()),
};

it("next answers the next page", () => {
	const answered = PagingController.over(store).next(Probe.create());

	assert.equal(Effect.runSync(answered) instanceof Surface, true);
});

it("prev answers the previous page", () => {
	const answered = PagingController.over(store).prev(Probe.create());

	assert.equal(Effect.runSync(answered) instanceof Surface, true);
});
