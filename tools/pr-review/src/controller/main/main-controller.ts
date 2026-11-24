import { Effect } from "effect";
import type {
	Model,
	NoReview,
	NotStarted,
	ReviewStatus,
	Session,
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
		model: Model,
	): Effect.Effect<Session, NotReviewable | NotStarted> {
		return this.#host.getChange(url).pipe(
			Effect.map((change) => change.review()),
			Effect.flatMap((ledger) =>
				this.#store
					.save(workdir, ledger)
					.pipe(Effect.flatMap(() => ledger.spawnedBy(this.#agent, model))),
			),
		);
	}

	status(workdir: Workdir): Effect.Effect<ReviewStatus, NoReview> {
		return this.#store
			.inWorkdir(workdir)
			.pipe(Effect.map((ledger) => ledger.status()));
	}
}

export { MainController };
