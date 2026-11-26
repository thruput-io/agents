import { Effect } from "effect";
import type { HostError } from "../generated/domain/host-error.g.ts";
import { Outcome } from "../generated/domain/outcome.g.ts";
import { ReviewStatus } from "../generated/domain/review-status.g.ts";
import type { TargetUrl } from "../generated/domain/target-url.g.ts";
import type { Agent } from "./agent.ts";
import { Assignment } from "./assignment.ts";
import type { Host } from "./host.ts";

class CompleteReview {
	readonly #url: TargetUrl;

	private constructor(url: TargetUrl) {
		this.#url = url;
		Object.freeze(this);
	}

	static of(url: TargetUrl): CompleteReview {
		return new CompleteReview(url);
	}

	status(): ReviewStatus {
		return ReviewStatus.create();
	}

	submittedTo(host: Host): Effect.Effect<CompleteReview, HostError> {
		return Effect.map(host.post(this.#url, Outcome.create()), () =>
			CompleteReview.of(this.#url),
		);
	}

	dismissedBy(agent: Agent): Effect.Effect<CompleteReview> {
		return Effect.map(agent.terminate(Assignment.create()), () =>
			CompleteReview.of(this.#url),
		);
	}
}

export { CompleteReview };
