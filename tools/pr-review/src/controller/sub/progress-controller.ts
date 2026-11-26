import { Effect } from "effect";
import type { Agent } from "../../domain/agent.ts";
import type { Assignment } from "../../domain/assignment.ts";
import type { Host } from "../../domain/host.ts";
import type { Instructions } from "../../domain/instructions.ts";
import type { Post } from "../../domain/post.ts";
import type { Review } from "../../domain/review.ts";
import type { NotRecorded, ReviewStore } from "../../domain/review-store.ts";
import type { Verdict } from "../../domain/verdict.ts";
import type { Acknowledgement } from "../../generated/domain/acknowledgement.g.ts";
import type { NotAcknowledged } from "../../generated/domain/not-acknowledged.g.ts";
import type { NotAssigned } from "../../generated/domain/not-assigned.g.ts";
import type { Probe } from "../../generated/domain/probe.g.ts";
import type { Rule } from "../../generated/domain/rule.g.ts";

const LATEST = -1;

type Standing = Effect.Effect<readonly Rule[], NotRecorded | Instructions>;

class ProgressController {
	private readonly host: Host;
	private readonly store: ReviewStore;
	private readonly agent: Agent;

	private constructor(host: Host, store: ReviewStore, agent: Agent) {
		this.host = host;
		this.store = store;
		this.agent = agent;
	}

	static over(
		host: Host,
		store: ReviewStore,
		agent: Agent,
	): ProgressController {
		return new ProgressController(host, store, agent);
	}

	standing(probe: Probe): Standing {
		return this.store
			.ofProbe(probe)
			.pipe(
				Effect.flatMap(
					(
						assignment: Assignment,
					): Effect.Effect<readonly Rule[], Instructions> =>
						assignment.standing(),
				),
			);
	}

	ack(probe: Probe, sent: Acknowledgement): Standing {
		return this.store
			.append(probe, sent)
			.pipe(Effect.flatMap((): Standing => this.standing(probe)));
	}

	report(
		probe: Probe,
		verdict: Verdict,
	): Effect.Effect<
		readonly Rule[],
		NotRecorded | NotAcknowledged | NotAssigned | Instructions
	> {
		return this.store.ofProbe(probe).pipe(
			Effect.flatMap(
				(
					assignment: Assignment,
				): Effect.Effect<readonly Rule[], NotAcknowledged> =>
					assignment.briefing().rules(),
			),
			Effect.flatMap(
				(rules: readonly Rule[]): Effect.Effect<Verdict, NotAssigned> =>
					verdict.among(rules),
			),
			Effect.flatMap(
				(assigned: Verdict): Effect.Effect<Review, NotRecorded> =>
					this.store.append(probe, assigned),
			),
			Effect.flatMap(
				(review: Review): Effect.Effect<readonly Review[], NotRecorded> =>
					this.concluded(probe, review),
			),
			Effect.flatMap((): Standing => this.standing(probe)),
		);
	}

	private concluded(
		probe: Probe,
		review: Review,
	): Effect.Effect<readonly Review[], NotRecorded> {
		return review.posting(this.host).pipe(
			Effect.flatMap(
				(
					posts: readonly Post[],
				): Effect.Effect<readonly Review[], NotRecorded> =>
					Effect.forEach(
						posts,
						(post: Post): Effect.Effect<Review, NotRecorded> =>
							this.store.append(probe, post),
					),
			),
			Effect.flatMap(
				(appended: readonly Review[]): Effect.Effect<readonly Review[]> =>
					Effect.forEach(
						[review, ...appended].slice(LATEST),
						(latest: Review): Effect.Effect<Review> =>
							latest.dismissedBy(this.agent),
					),
			),
		);
	}
}

export { ProgressController };
