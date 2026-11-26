import { Effect } from "effect";
import type { Assignment } from "../../../domain/assignment.ts";
import type { Recorded, Review, ReviewStore } from "../../../domain/review.ts";
import type { NoReview } from "../../../generated/domain/no-review.g.ts";
import type { Probe } from "../../../generated/domain/probe.g.ts";
import type { Workdir } from "../../../generated/domain/workdir.g.ts";
import { keyOf, nothingStored } from "../../../perimeters/memory.ts";

type Kept = readonly [string, Review];

const memoryStore = (): ReviewStore => {
	const reviews = new Map<string, Review>();

	const holding = (probe: Probe): Effect.Effect<Kept, NoReview> =>
		Effect.firstSuccessOf([
			Effect.fail(nothingStored()),
			...[...reviews].map(
				([key, review]: [string, Review]): Effect.Effect<Kept, NoReview> =>
					review
						.assignmentOf(probe)
						.pipe(Effect.map((): Kept => [key, review])),
			),
		]);

	const kept = (key: string, review: Review): Effect.Effect<Review> =>
		Effect.sync((): Review => {
			reviews.set(key, review);

			return review;
		});

	return {
		save: (workdir: Workdir, review: Review): Effect.Effect<Review> =>
			kept(keyOf(workdir), review),
		inWorkdir: (workdir: Workdir): Effect.Effect<Review, NoReview> =>
			Effect.fromNullishOr(reviews.get(keyOf(workdir))).pipe(
				Effect.mapError((): NoReview => nothingStored()),
			),
		ofProbe: (probe: Probe): Effect.Effect<Assignment, NoReview> =>
			holding(probe).pipe(
				Effect.flatMap(
					([, review]: Kept): Effect.Effect<Assignment, NoReview> =>
						review.assignmentOf(probe),
				),
			),
		append: (
			probe: Probe,
			recorded: Recorded,
		): Effect.Effect<Review, NoReview> =>
			holding(probe).pipe(
				Effect.flatMap(
					([key, review]: Kept): Effect.Effect<Review> =>
						kept(key, review.after(probe, recorded)),
				),
			),
	};
};

export { memoryStore };
