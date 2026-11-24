import { Effect } from "effect";
import type { NoReview, Probe, Session, Surface } from "../../domain/domain.ts";
import type { ReviewStore } from "../../domain/review.ts";
import { assignmentIn } from "../common/assignment.ts";

class PagingController {
	readonly #store: ReviewStore;

	private constructor(store: ReviewStore) {
		this.#store = store;
	}

	static over(store: ReviewStore): PagingController {
		return new PagingController(store);
	}

	next(session: Session, probe: Probe): Effect.Effect<Surface, NoReview> {
		return assignmentIn(this.#store, session, probe).pipe(
			Effect.map((assignment) => assignment.cursor().next()),
		);
	}

	prev(session: Session, probe: Probe): Effect.Effect<Surface, NoReview> {
		return assignmentIn(this.#store, session, probe).pipe(
			Effect.map((assignment) => assignment.cursor().previous()),
		);
	}
}

export { PagingController };
