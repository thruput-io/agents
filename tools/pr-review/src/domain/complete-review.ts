import { Effect } from "effect";
import type { HostError } from "../generated/domain/host-error.g.ts";
import type { Outcome } from "../generated/domain/outcome.g.ts";
import type { ReviewStatus } from "../generated/domain/review-status.g.ts";
import type { TargetUrl } from "../generated/domain/target-url.g.ts";
import type { Agent } from "./agent.ts";
import type { Assignments } from "./assignments.ts";
import type { Host } from "./host.ts";

interface CompleteReviewParts {
	readonly url: TargetUrl;
	readonly outcome: Outcome;
	readonly state: ReviewStatus;
	readonly assignments: Assignments;
}

class CompleteReview {
	private readonly parts: CompleteReviewParts;

	private constructor(parts: CompleteReviewParts) {
		this.parts = parts;
		Object.freeze(this);
	}

	static of(parts: CompleteReviewParts): CompleteReview {
		return new CompleteReview(parts);
	}

	status(): ReviewStatus {
		return this.parts.state;
	}

	submittedTo(host: Host): Effect.Effect<CompleteReview, HostError> {
		return host
			.post(this.parts.url, this.parts.outcome)
			.pipe(Effect.map((): CompleteReview => this));
	}

	dismissedBy(agent: Agent): Effect.Effect<CompleteReview> {
		return this.parts.assignments
			.dismissedBy(agent)
			.pipe(Effect.map((): CompleteReview => this));
	}
}

export { CompleteReview };
