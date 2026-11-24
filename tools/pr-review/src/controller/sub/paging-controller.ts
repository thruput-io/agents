import { Effect } from "effect";
import type { NoReview, Probe, Session, Surface } from "../../domain/domain.ts";
import type { Reviews } from "../../domain/review.ts";
import { assignmentIn } from "../common/assignments.ts";

class PagingController {
	readonly #reviews: Reviews;

	private constructor(reviews: Reviews) {
		this.#reviews = reviews;
	}

	static over(reviews: Reviews): PagingController {
		return new PagingController(reviews);
	}

	next(session: Session, probe: Probe): Effect.Effect<Surface, NoReview> {
		return assignmentIn(this.#reviews, session, probe).pipe(
			Effect.map((assignment) => assignment.pages().next()),
		);
	}

	prev(session: Session, probe: Probe): Effect.Effect<Surface, NoReview> {
		return assignmentIn(this.#reviews, session, probe).pipe(
			Effect.map((assignment) => assignment.pages().previous()),
		);
	}
}

export { PagingController };
