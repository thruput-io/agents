import { Effect } from "effect";
import type {
	NoReview,
	ReviewStatus,
	Session,
	TargetUrl,
	Workdir,
} from "../../domain/domain.ts";
import type { Hosts, NotReviewable, Reviews } from "../../domain/review.ts";

class MainController {
	readonly #hosts: Hosts;
	readonly #reviews: Reviews;

	private constructor(hosts: Hosts, reviews: Reviews) {
		this.#hosts = hosts;
		this.#reviews = reviews;
	}

	static over(hosts: Hosts, reviews: Reviews): MainController {
		return new MainController(hosts, reviews);
	}

	prepare(
		url: TargetUrl,
		workdir: Workdir,
	): Effect.Effect<Session, NotReviewable> {
		return this.#hosts.getChange(url).pipe(
			Effect.flatMap((change) => this.#reviews.save(workdir, change.review())),
			Effect.map((ledger) => ledger.session()),
		);
	}

	status(workdir: Workdir): Effect.Effect<ReviewStatus, NoReview> {
		return this.#reviews
			.inWorkdir(workdir)
			.pipe(Effect.map((ledger) => ledger.status()));
	}
}

export { MainController };
