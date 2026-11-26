import { Effect } from "effect";
import type { NotStarted } from "../generated/domain/not-started.g.ts";
import type { ReviewStatus } from "../generated/domain/review-status.g.ts";
import type { Agent } from "./agent.ts";
import type { Assignments } from "./assignments.ts";

class PendingReview {
	private readonly state: ReviewStatus;
	private readonly assignments: Assignments;

	private constructor(state: ReviewStatus, assignments: Assignments) {
		this.state = state;
		this.assignments = assignments;
		Object.freeze(this);
	}

	static of(state: ReviewStatus, assignments: Assignments): PendingReview {
		return new PendingReview(state, assignments);
	}

	status(): ReviewStatus {
		return this.state;
	}

	submittedTo(): Effect.Effect<PendingReview> {
		return Effect.succeed(this);
	}

	dismissedBy(): Effect.Effect<PendingReview> {
		return Effect.succeed(this);
	}

	spawnedBy(agent: Agent): Effect.Effect<PendingReview, NotStarted> {
		return this.assignments
			.spawnedBy(agent)
			.pipe(Effect.map((): PendingReview => this));
	}
}

export { PendingReview };
