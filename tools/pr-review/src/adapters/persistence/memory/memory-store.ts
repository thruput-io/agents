import { Effect } from "effect";
import { noReviewFrom } from "../../../domain/factory.ts";
import type { ReviewStore } from "../../../domain/review.ts";

const memoryStore: ReviewStore = {
	save: (_workdir, review) => Effect.succeed(review),
	inWorkdir: () => Effect.fail(noReviewFrom()),
	ofProbe: () => Effect.fail(noReviewFrom()),
	append: () => Effect.fail(noReviewFrom()),
};

export { memoryStore };
