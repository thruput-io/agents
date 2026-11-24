import { Effect } from "effect";
import type {
	HostError,
	NoReview,
	Probe,
	Report,
	ReviewStatus,
	Session,
} from "../../domain/domain.ts";
import type { Hosts, Reviews } from "../../domain/review.ts";
import { assignmentIn } from "../common/assignments.ts";

class ProgressController {
	readonly #hosts: Hosts;
	readonly #reviews: Reviews;

	private constructor(hosts: Hosts, reviews: Reviews) {
		this.#hosts = hosts;
		this.#reviews = reviews;
	}

	static over(hosts: Hosts, reviews: Reviews): ProgressController {
		return new ProgressController(hosts, reviews);
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
				assignment.recorded(report).submittedTo(this.#hosts),
			),
			Effect.flatMap((ledger) => this.#reviews.replace(session, ledger)),
			Effect.map((ledger) => ledger.status()),
		);
	}
}

export { ProgressController };
