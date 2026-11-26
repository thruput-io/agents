import { Effect } from "effect";
import type { Agent } from "../../domain/agent.ts";
import type { Host } from "../../domain/host.ts";
import type { Instructions } from "../../domain/instructions.ts";
import type { Review, ReviewStore } from "../../domain/review.ts";
import type { Acknowledgement } from "../../generated/domain/acknowledgement.g.ts";
import type { HostError } from "../../generated/domain/host-error.g.ts";
import type { NoReview } from "../../generated/domain/no-review.g.ts";
import type { Probe } from "../../generated/domain/probe.g.ts";
import type { Progress } from "../../generated/domain/progress.g.ts";
import type { Verdict } from "../../generated/domain/verdict.g.ts";

class ProgressController {
	readonly #host: Host;
	readonly #store: ReviewStore;
	readonly #agent: Agent;

	private constructor(host: Host, store: ReviewStore, agent: Agent) {
		this.#host = host;
		this.#store = store;
		this.#agent = agent;
	}

	static over(
		host: Host,
		store: ReviewStore,
		agent: Agent,
	): ProgressController {
		return new ProgressController(host, store, agent);
	}

	ack(
		probe: Probe,
		acknowledgement: Acknowledgement,
	): Effect.Effect<Progress, NoReview | Instructions> {
		return this.#store.ofProbe(probe).pipe(
			Effect.flatMap((assignment) => assignment.accepted(acknowledgement)),
			Effect.flatMap((accepted) => this.#store.append(probe, accepted)),
			Effect.flatMap(() => this.#progressOf(probe)),
		);
	}

	report(probe: Probe, verdict: Verdict): Effect.Effect<Progress, NoReview> {
		return this.#store.append(probe, verdict).pipe(
			Effect.flatMap((review) => this.#submitted(probe, review)),
			Effect.flatMap((review) => this.#dismissed(review)),
			Effect.flatMap(() => this.#progressOf(probe)),
		);
	}

	#submitted(probe: Probe, review: Review): Effect.Effect<Review, NoReview> {
		const submitted: Effect.Effect<Review, HostError> = review.submittedTo(
			this.#host,
		);

		return submitted.pipe(
			Effect.catch((hostError) => this.#store.append(probe, hostError)),
		);
	}

	#dismissed(review: Review): Effect.Effect<Review> {
		return review.dismissedBy(this.#agent);
	}

	#progressOf(probe: Probe): Effect.Effect<Progress, NoReview> {
		return this.#store
			.ofProbe(probe)
			.pipe(Effect.map((assignment) => assignment.progress()));
	}
}

export { ProgressController };
