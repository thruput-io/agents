import { Effect } from "effect";
import type {
	Definition,
	Instructions,
	NoReview,
	Probe,
	Ruleset,
	Session,
	Term,
} from "../../domain/domain.ts";
import type { Reviews } from "../../domain/review.ts";
import { assignmentIn } from "../common/assignments.ts";

class BriefingController {
	readonly #reviews: Reviews;

	private constructor(reviews: Reviews) {
		this.#reviews = reviews;
	}

	static over(reviews: Reviews): BriefingController {
		return new BriefingController(reviews);
	}

	instructions(
		session: Session,
		probe: Probe,
	): Effect.Effect<Instructions, NoReview> {
		return assignmentIn(this.#reviews, session, probe).pipe(
			Effect.map((assignment) => assignment.briefing().instructions()),
		);
	}

	rules(session: Session, probe: Probe): Effect.Effect<Ruleset, NoReview> {
		return assignmentIn(this.#reviews, session, probe).pipe(
			Effect.map((assignment) => assignment.briefing().rules()),
		);
	}

	define(
		session: Session,
		probe: Probe,
		term: Term,
	): Effect.Effect<Definition, NoReview> {
		return assignmentIn(this.#reviews, session, probe).pipe(
			Effect.map((assignment) => assignment.briefing().definitionOf(term)),
		);
	}
}

export { BriefingController };
