import { Effect } from "effect";
import type {
	HostError,
	NoReview,
	Probe,
	Report,
	ReviewStatus,
	Session,
} from "../../domain/domain.ts";
import type { Host, Reviews } from "../../domain/review.ts";
import { assignmentIn } from "../common/assignments.ts";

class ProgressController {
	readonly #host: Host;
	readonly #reviews: Reviews;

	private constructor(host: Host, reviews: Reviews) {
		this.#host = host;
		this.#reviews = reviews;
	}

	static over(host: Host, reviews: Reviews): ProgressController {
		return new ProgressController(host, reviews);
	}

	ack(session: Session, probe: Probe): Effect.Effect<ReviewStatus, NoReview> {
		return assignmentIn(this.#reviews, session, probe).pipe(
			Effect.flatMap((assignment) =>
				this.#reviews.replace(session, assignment.acknowledged()),
			),
			Effect.map((ledger) => ledger.status()),
		);
	}

	report(
		session: Session,
		probe: Probe,
		report: Report,
	): Effect.Effect<ReviewStatus, NoReview | HostError> {
		return assignmentIn(this.#reviews, session, probe).pipe(
			Effect.flatMap((assignment) =>
				assignment.recorded(report).submittedTo(this.#host),
			),
			Effect.flatMap((ledger) => this.#reviews.replace(session, ledger)),
			Effect.map((ledger) => ledger.status()),
		);
	}
}

export { ProgressController };
