import { Effect } from "effect";
import type {
	Agent,
	Host,
	Instructions,
	ReviewStore,
} from "../../domain/review.ts";
import type {
	Acknowledgement,
	NoReview,
	Probe,
	Progress,
	Verdict,
} from "../../generated/domain/value.g.ts";

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
			Effect.flatMap((review) =>
				review
					.submittedTo(this.#host)
					.pipe(
						Effect.catch((hostError) => this.#store.append(probe, hostError)),
					),
			),
			Effect.flatMap((review) => review.dismissedBy(this.#agent)),
			Effect.flatMap(() => this.#progressOf(probe)),
		);
	}

	#progressOf(probe: Probe): Effect.Effect<Progress, NoReview> {
		return this.#store
			.ofProbe(probe)
			.pipe(Effect.map((assignment) => assignment.progress()));
	}
}

export { ProgressController };
