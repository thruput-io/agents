import { Effect } from "effect";
import type { Review, ReviewStore } from "../../../domain/review.ts";
import type { NoReview } from "../../../generated/domain/no-review.g.ts";
import type { Workdir } from "../../../generated/domain/workdir.g.ts";
import { keyOf, nothingStored } from "../../../perimeters/memory.ts";

type MemoryStore = Pick<ReviewStore, "save" | "inWorkdir">;

const memoryStore = (): MemoryStore => {
	const reviews = new Map<string, Review>();

	return {
		save: (workdir: Workdir, review: Review): Effect.Effect<Review> =>
			Effect.sync((): Review => {
				reviews.set(keyOf(workdir), review);

				return review;
			}),
		inWorkdir: (workdir: Workdir): Effect.Effect<Review, NoReview> =>
			Effect.fromNullishOr(reviews.get(keyOf(workdir))).pipe(
				Effect.mapError((): NoReview => nothingStored()),
			),
	};
};

export { memoryStore };
