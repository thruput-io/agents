import { Effect } from "effect";
import type {
	NoReview,
	ReviewStatus,
	Session,
	TargetUrl,
	Workdir,
} from "../../domain/domain.ts";
import type { Host, NotReviewable, Reviews } from "../../domain/review.ts";

class MainController {
	readonly #host: Host;
	readonly #reviews: Reviews;

	private constructor(host: Host, reviews: Reviews) {
		this.#host = host;
		this.#reviews = reviews;
	}

	static over(host: Host, reviews: Reviews): MainController {
		return new MainController(host, reviews);
	}

	prepare(
		url: TargetUrl,
		workdir: Workdir,
	): Effect.Effect<Session, NotReviewable> {
		return this.#host.getChange(url).pipe(
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
