import { Effect } from "effect";
import type { Agent } from "../../domain/agent.ts";
import type { Change } from "../../domain/change.ts";
import type { Host, NotReviewable } from "../../domain/host.ts";
import type { NoReview } from "../../domain/no-review.ts";
import type { NotStarted } from "../../domain/not-started.ts";
import type { Review, ReviewStatus } from "../../domain/review.ts";
import type { ReviewStore } from "../../domain/review-store.ts";
import { Session } from "../../domain/session.ts";
import type { TargetUrl } from "../../domain/target-url.ts";
import type { Probes } from "../../domain/task.ts";
import type { Workdir } from "../../domain/workdir.ts";
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
		workdir: Workdir,
		probesFor: (session: Session) => Probes,
	): Effect.Effect<Session, NotReviewable | NotStarted | WorkdirFailed> {
		return this.store.created(workdir).pipe(
			Effect.map(Session.in),
			Effect.flatMap(
				(
					session: Session,
				): Effect.Effect<Session, NotReviewable | NotStarted | WorkdirFailed> =>
					this.started(url, session, probesFor(session)),
			),
		);
	}

	private started(
		url: TargetUrl,
		session: Session,
		probes: Probes,
	): Effect.Effect<Session, NotReviewable | NotStarted | WorkdirFailed> {
		return this.host.getChange(url, session).pipe(
			Effect.flatMap(
				(change: Change): Effect.Effect<Review, WorkdirFailed> =>
					this.store.save(session, change.review(probes)),
			),
			Effect.flatMap(
				(review: Review): Effect.Effect<Review, NotStarted> =>
					review.spawnedBy(this.agent),
			),
			Effect.map((): Session => session),
		);
	}

	status(workdir: Session): Effect.Effect<ReviewStatus, NoReview> {
		return this.store
			.inWorkdir(workdir)
			.pipe(Effect.map((review: Review): ReviewStatus => review.status()));
	}
}

export { MainController };
