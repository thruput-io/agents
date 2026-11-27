import { Effect } from "effect";
import type { Agent } from "../../domain/agent.ts";
import type { Change } from "../../domain/change.ts";
import type { Host, NotReviewable } from "../../domain/host.ts";
import type { NoReview } from "../../domain/no-review.ts";
import type { NotStarted } from "../../domain/not-started.ts";
import type { Review, ReviewStatus } from "../../domain/review.ts";
import type { ReviewStore } from "../../domain/review-store.ts";
import type { Session } from "../../domain/session.ts";
import type { TargetUrl } from "../../domain/target-url.ts";
import type { Probes } from "../../domain/task.ts";
import type { WorkdirFailed } from "../../domain/workdir-failed.ts";

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
		workdir: Session,
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

	status(workdir: Session): Effect.Effect<ReviewStatus, NoReview> {
		return this.store
			.inWorkdir(workdir)
			.pipe(Effect.map((review: Review): ReviewStatus => review.status()));
	}
}

export { MainController };
