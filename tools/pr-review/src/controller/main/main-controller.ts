import { Effect } from "effect";
import type { Agent } from "../../domain/agent.ts";
import type { Host, NotReviewable } from "../../domain/host.ts";
import type { ReviewStore } from "../../domain/review.ts";
import type { NoReview } from "../../generated/domain/no-review.g.ts";
import type { NotStarted } from "../../generated/domain/not-started.g.ts";
import type { Probes } from "../../generated/domain/probes.g.ts";
import type { ReviewStatus } from "../../generated/domain/review-status.g.ts";
import type { TargetUrl } from "../../generated/domain/target-url.g.ts";
import type { Workdir } from "../../generated/domain/workdir.g.ts";

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
