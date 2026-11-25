import { Effect } from "effect";
import type {
	NoReview,
	NotStarted,
	Probes,
	ReviewStatus,
	TargetUrl,
	Workdir,
} from "../../domain/domain.ts";
import type {
	Agent,
	Host,
	NotReviewable,
	ReviewStore,
} from "../../domain/review.ts";

class MainController {
	readonly #host: Host;
	readonly #store: ReviewStore;
	readonly #agent: Agent;

	private constructor(host: Host, store: ReviewStore, agent: Agent) {
		this.#host = host;
		this.#store = store;
		this.#agent = agent;
	}

	static over(host: Host, store: ReviewStore, agent: Agent): MainController {
		return new MainController(host, store, agent);
	}

	prepare(
		url: TargetUrl,
		workdir: Workdir,
		probes: Probes,
	): Effect.Effect<ReviewStatus, NotReviewable | NotStarted> {
		return this.#host.getChange(url).pipe(
			Effect.map((change) => change.review(probes)),
			Effect.flatMap((review) =>
				this.#store
					.save(workdir, review)
					.pipe(Effect.flatMap(() => review.spawnedBy(this.#agent))),
			),
			Effect.map((review) => review.status()),
		);
	}

	status(workdir: Workdir): Effect.Effect<ReviewStatus, NoReview> {
		return this.#store
			.inWorkdir(workdir)
			.pipe(Effect.map((review) => review.status()));
	}
}

export { MainController };
