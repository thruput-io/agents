import { Effect } from "effect";
import type { Review, ReviewStore } from "../../../domain/review.ts";
import type { NoReview } from "../../../generated/domain/no-review.g.ts";
import type { Workdir } from "../../../generated/domain/workdir.g.ts";
import { nothingStored } from "../../../perimeters/memory.ts";

const memoryStore: ReviewStore = {
	save: (_workdir: Workdir, review: Review): Effect.Effect<Review> =>
		Effect.succeed(review),
	inWorkdir: (): Effect.Effect<Review, NoReview> =>
		Effect.fail(nothingStored()),
	ofProbe: (): Effect.Effect<never, NoReview> => Effect.fail(nothingStored()),
	append: (): Effect.Effect<Review, NoReview> => Effect.fail(nothingStored()),
};

export { memoryStore };
