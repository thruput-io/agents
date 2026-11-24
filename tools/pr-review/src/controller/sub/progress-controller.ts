import { Effect } from "effect";
import type {
	HostError,
	NoReview,
	Probe,
	Report,
	ReviewStatus,
	Session,
} from "../../domain/domain.ts";
import type { Host, ReviewStore } from "../../domain/review.ts";
import { assignmentIn } from "../common/assignment.ts";

class ProgressController {
	readonly #host: Host;
	readonly #store: ReviewStore;

	private constructor(host: Host, store: ReviewStore) {
		this.#host = host;
		this.#store = store;
	}

	static over(host: Host, store: ReviewStore): ProgressController {
		return new ProgressController(host, store);
	}

	ack(session: Session, probe: Probe): Effect.Effect<ReviewStatus, NoReview> {
		return assignmentIn(this.#store, session, probe).pipe(
			Effect.flatMap((assignment) =>
				this.#store.replace(session, assignment.acknowledged()),
			),
			Effect.map((ledger) => ledger.status()),
		);
	}

	report(
		session: Session,
		probe: Probe,
		report: Report,
	): Effect.Effect<ReviewStatus, NoReview | HostError> {
		return assignmentIn(this.#store, session, probe).pipe(
			Effect.flatMap((assignment) =>
				assignment.recorded(report).submittedTo(this.#host),
			),
			Effect.flatMap((ledger) => this.#store.replace(session, ledger)),
			Effect.map((ledger) => ledger.status()),
		);
	}
}

export { ProgressController };
