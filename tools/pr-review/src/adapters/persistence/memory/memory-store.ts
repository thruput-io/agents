import { Effect } from "effect";
import type { ReviewStore } from "../../../domain/review.ts";
import { noReviewFrom } from "../../../generated/domain/factory.g.ts";

const memoryStore: ReviewStore = {
	save: (_workdir, review) => Effect.succeed(review),
	inWorkdir: () => Effect.fail(noReviewFrom()),
	ofProbe: () => Effect.fail(noReviewFrom()),
	append: () => Effect.fail(noReviewFrom()),
};

export { memoryStore };
