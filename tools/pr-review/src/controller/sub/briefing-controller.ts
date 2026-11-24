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
import type { ReviewStore } from "../../domain/review.ts";
import { assignmentIn } from "../common/assignment.ts";

class BriefingController {
	readonly #store: ReviewStore;

	private constructor(store: ReviewStore) {
		this.#store = store;
	}

	static over(store: ReviewStore): BriefingController {
		return new BriefingController(store);
	}

	instructions(
		session: Session,
		probe: Probe,
	): Effect.Effect<Instructions, NoReview> {
		return assignmentIn(this.#store, session, probe).pipe(
			Effect.map((assignment) => assignment.briefing().instructions()),
		);
	}

	rules(session: Session, probe: Probe): Effect.Effect<Ruleset, NoReview> {
		return assignmentIn(this.#store, session, probe).pipe(
			Effect.map((assignment) => assignment.briefing().rules()),
		);
	}

	define(
		session: Session,
		probe: Probe,
		term: Term,
	): Effect.Effect<Definition, NoReview> {
		return assignmentIn(this.#store, session, probe).pipe(
			Effect.map((assignment) => assignment.briefing().definitionOf(term)),
		);
	}
}

export { BriefingController };
