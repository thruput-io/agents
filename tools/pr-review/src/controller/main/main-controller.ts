import { Effect } from "effect";
import type {
	NoReview,
	ReviewStatus,
	Session,
	TargetUrl,
	Workdir,
} from "../../domain/domain.ts";
import type { Host, NotReviewable, ReviewStore } from "../../domain/review.ts";

class MainController {
	readonly #host: Host;
	readonly #store: ReviewStore;

	private constructor(host: Host, store: ReviewStore) {
		this.#host = host;
		this.#store = store;
	}

	static over(host: Host, store: ReviewStore): MainController {
		return new MainController(host, store);
	}

	prepare(
		url: TargetUrl,
		workdir: Workdir,
	): Effect.Effect<Session, NotReviewable> {
		return this.#host.getChange(url).pipe(
			Effect.flatMap((change) => this.#store.save(workdir, change.review())),
			Effect.map((ledger) => ledger.session()),
		);
	}

	status(workdir: Workdir): Effect.Effect<ReviewStatus, NoReview> {
		return this.#store
			.inWorkdir(workdir)
			.pipe(Effect.map((ledger) => ledger.status()));
	}
}

export { MainController };
