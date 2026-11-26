import { Effect } from "effect";
import type { Instructions } from "../../domain/instructions.ts";
import type { ReviewStore } from "../../domain/review.ts";
import type { Definition } from "../../generated/domain/definition.g.ts";
import type { NoReview } from "../../generated/domain/no-review.g.ts";
import type { Probe } from "../../generated/domain/probe.g.ts";
import type { Ruleset } from "../../generated/domain/ruleset.g.ts";
import type { Term } from "../../generated/domain/term.g.ts";

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
