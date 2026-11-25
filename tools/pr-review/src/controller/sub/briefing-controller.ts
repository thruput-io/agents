import { Effect } from "effect";
import type {
	Definition,
	NoReview,
	Probe,
	Ruleset,
	Term,
} from "../../domain/domain.ts";
import type { Instructions, ReviewStore } from "../../domain/review.ts";

class BriefingController {
	readonly #store: ReviewStore;

	private constructor(store: ReviewStore) {
		this.#store = store;
	}

	static over(store: ReviewStore): BriefingController {
		return new BriefingController(store);
	}

	instructions(probe: Probe): Effect.Effect<Instructions, NoReview> {
		return this.#store
			.ofProbe(probe)
			.pipe(Effect.map((assignment) => assignment.briefing().instructions()));
	}

	rules(probe: Probe): Effect.Effect<Ruleset, NoReview> {
		return this.#store
			.ofProbe(probe)
			.pipe(Effect.map((assignment) => assignment.briefing().rules()));
	}

	define(probe: Probe, term: Term): Effect.Effect<Definition, NoReview> {
		return this.#store
			.ofProbe(probe)
			.pipe(
				Effect.map((assignment) => assignment.briefing().definitionOf(term)),
			);
	}
}

export { BriefingController };
