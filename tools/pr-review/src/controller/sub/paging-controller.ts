import { Effect } from "effect";
import type { Assignment, Entry } from "../../domain/assignment.ts";
import { Back } from "../../domain/back.ts";
import { Forward } from "../../domain/forward.ts";
import type { NoPage } from "../../domain/no-page.ts";
import type { NoReview } from "../../domain/no-review.ts";
import type { NotAcknowledged } from "../../domain/not-acknowledged.ts";
import type { Page } from "../../domain/page.ts";
import type { Probe } from "../../domain/probe.ts";
import type { Review } from "../../domain/review.ts";
import type { NotRecorded, ReviewStore } from "../../domain/review-store.ts";

type Turned = Effect.Effect<Page, NotRecorded | NoPage | NotAcknowledged>;

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
