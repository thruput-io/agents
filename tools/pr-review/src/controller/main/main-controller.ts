import { Effect } from "effect";
import type { Agent } from "../../domain/agent.ts";
import type { Change } from "../../domain/change.ts";
import type { Host, NotReviewable } from "../../domain/host.ts";
import type { Review, ReviewStatus } from "../../domain/review.ts";
import type { ReviewStore } from "../../domain/review-store.ts";
import type { Probes } from "../../domain/task.ts";
import type { NoReview } from "../../generated/domain/no-review.g.ts";
import type { NotStarted } from "../../generated/domain/not-started.g.ts";
import type { TargetUrl } from "../../generated/domain/target-url.g.ts";
import type { Workdir } from "../../generated/domain/workdir.g.ts";
import type { WorkdirFailed } from "../../generated/domain/workdir-failed.g.ts";

class MainController {
	private readonly host: Host;
	private readonly store: ReviewStore;
	private readonly agent: Agent;

	private constructor(host: Host, store: ReviewStore, agent: Agent) {
		this.host = host;
		this.store = store;
		this.agent = agent;
	}

	static over(host: Host, store: ReviewStore, agent: Agent): MainController {
		return new MainController(host, store, agent);
	}

	prepare(
		url: TargetUrl,
		workdir: Workdir,
		probes: Probes,
	): Effect.Effect<ReviewStatus, NotReviewable | NotStarted | WorkdirFailed> {
		return this.host.getChange(url, workdir).pipe(
			Effect.flatMap(
				(change: Change): Effect.Effect<Review, WorkdirFailed> =>
					this.store.save(workdir, change.review(probes)),
			),
			Effect.flatMap(
				(review: Review): Effect.Effect<Review, NotStarted> =>
					review.spawnedBy(this.agent),
			),
			Effect.map((review: Review): ReviewStatus => review.status()),
		);
	}

	status(workdir: Workdir): Effect.Effect<ReviewStatus, NoReview> {
		return this.store
			.inWorkdir(workdir)
			.pipe(Effect.map((review: Review): ReviewStatus => review.status()));
	}
}

export { MainController };
