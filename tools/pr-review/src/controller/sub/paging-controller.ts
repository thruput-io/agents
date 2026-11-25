import { Effect } from "effect";
import type { NoReview, Probe, Surface } from "../../domain/domain.ts";
import type { ReviewStore } from "../../domain/review.ts";

class PagingController {
	readonly #store: ReviewStore;

	private constructor(store: ReviewStore) {
		this.#store = store;
	}

	static over(store: ReviewStore): PagingController {
		return new PagingController(store);
	}

	next(probe: Probe): Effect.Effect<Surface, NoReview> {
		return this.#store
			.ofProbe(probe)
			.pipe(Effect.map((assignment) => assignment.cursor().next()));
	}

	prev(probe: Probe): Effect.Effect<Surface, NoReview> {
		return this.#store
			.ofProbe(probe)
			.pipe(Effect.map((assignment) => assignment.cursor().previous()));
	}
}

export { PagingController };
