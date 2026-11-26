import { Effect } from "effect";
import type { Assignment, Entry } from "../../domain/assignment.ts";
import type { Review, ReviewStore } from "../../domain/review.ts";
import { Back } from "../../generated/domain/back.g.ts";
import { Forward } from "../../generated/domain/forward.g.ts";
import type { NoPage } from "../../generated/domain/no-page.g.ts";
import type { NoReview } from "../../generated/domain/no-review.g.ts";
import type { NotAcknowledged } from "../../generated/domain/not-acknowledged.g.ts";
import type { Page } from "../../generated/domain/page.g.ts";
import type { Probe } from "../../generated/domain/probe.g.ts";

type Turned = Effect.Effect<Page, NoReview | NoPage | NotAcknowledged>;

class PagingController {
	private readonly store: ReviewStore;

	private constructor(store: ReviewStore) {
		this.store = store;
	}

	static over(store: ReviewStore): PagingController {
		return new PagingController(store);
	}

	next(probe: Probe): Turned {
		return this.turned(probe, Forward.create());
	}

	prev(probe: Probe): Turned {
		return this.turned(probe, Back.create());
	}

	private turned(probe: Probe, turn: Entry): Turned {
		return this.store.append(probe, turn).pipe(
			Effect.flatMap(
				(review: Review): Effect.Effect<Assignment, NoReview> =>
					review.assignmentOf(probe),
			),
			Effect.flatMap(
				(
					assignment: Assignment,
				): Effect.Effect<Page, NoPage | NotAcknowledged> =>
					assignment.briefing().page(),
			),
		);
	}
}

export { PagingController };
