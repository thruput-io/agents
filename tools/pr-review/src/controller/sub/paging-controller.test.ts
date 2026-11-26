import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import type { ReviewStore } from "../../domain/review.ts";
import { NoPage } from "../../generated/domain/no-page.g.ts";
import { NotAcknowledged } from "../../generated/domain/not-acknowledged.g.ts";
import { Page } from "../../generated/domain/page.g.ts";
import {
	probe,
	sent,
	storeWithReview,
} from "../common/stand-in.test-support.ts";
import { PagingController } from "./paging-controller.ts";

const acknowledgedStore = (): ReviewStore => {
	const store: ReviewStore = storeWithReview();

	Effect.runSync(store.append(probe, sent));

	return store;
};

it("next fails before the instructions are acknowledged", () => {
	const answered = PagingController.over(storeWithReview()).next(probe);

	assert.equal(
		Effect.runSync(Effect.flip(answered)) instanceof NotAcknowledged,
		true,
	);
});

it("next answers the first page", () => {
	const answered = PagingController.over(acknowledgedStore()).next(probe);

	assert.equal(Effect.runSync(answered) instanceof Page, true);
});

it("next past the last page answers no page", () => {
	const paging: PagingController = PagingController.over(acknowledgedStore());
	const answered = paging
		.next(probe)
		.pipe(Effect.flatMap(() => paging.next(probe)));

	assert.equal(Effect.runSync(Effect.flip(answered)) instanceof NoPage, true);
});

it("prev after next past the last page answers the last page again", () => {
	const paging: PagingController = PagingController.over(acknowledgedStore());
	const answered = paging.next(probe).pipe(
		Effect.flatMap(() => Effect.flip(paging.next(probe))),
		Effect.flatMap(() => paging.prev(probe)),
	);

	assert.equal(Effect.runSync(answered) instanceof Page, true);
});
