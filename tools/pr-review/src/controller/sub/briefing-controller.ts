import { Effect } from "effect";
import type { Assignment } from "../../domain/assignment.ts";
import type { Definition } from "../../domain/definition.ts";
import type { Instructions } from "../../domain/instructions.ts";
import type { NoReview } from "../../domain/no-review.ts";
import type { NotAcknowledged } from "../../domain/not-acknowledged.ts";
import type { NotDefined } from "../../domain/not-defined.ts";
import type { Probe } from "../../domain/probe.ts";
import type { ReviewStore } from "../../domain/review-store.ts";
import type { Rule } from "../../domain/rule.ts";
import type { Term } from "../../domain/term.ts";

class BriefingController {
	private readonly store: ReviewStore;

	private constructor(store: ReviewStore) {
		this.store = store;
	}

	static over(store: ReviewStore): BriefingController {
		return new BriefingController(store);
	}

	instructions(probe: Probe): Effect.Effect<Instructions, NoReview> {
		return this.store
			.ofProbe(probe)
			.pipe(
				Effect.map(
					(assignment: Assignment): Instructions =>
						assignment.briefing().instructions(),
				),
			);
	}

	rules(
		probe: Probe,
	): Effect.Effect<readonly Rule[], NoReview | NotAcknowledged> {
		return this.store
			.ofProbe(probe)
			.pipe(
				Effect.flatMap(
					(
						assignment: Assignment,
					): Effect.Effect<readonly Rule[], NotAcknowledged> =>
						assignment.briefing().rules(),
				),
			);
	}

	define(
		probe: Probe,
		term: Term,
	): Effect.Effect<Definition, NoReview | NotDefined> {
		return this.store
			.ofProbe(probe)
			.pipe(
				Effect.flatMap(
					(assignment: Assignment): Effect.Effect<Definition, NotDefined> =>
						assignment.briefing().definitionOf(term),
				),
			);
	}
}

export { BriefingController };
