import { Effect } from "effect";
import type { NotStarted } from "../generated/domain/not-started.g.ts";
import { ReviewStatus } from "../generated/domain/review-status.g.ts";
import type { Agent } from "./agent.ts";
import { Assignment } from "./assignment.ts";

class PendingReview {
	readonly #kind = "pending-review";

	private constructor() {
		Object.freeze(this);
	}

	static create(): PendingReview {
		return new PendingReview();
	}

	toJSON(): { readonly kind: string } {
		return { kind: this.#kind };
	}

	status(): ReviewStatus {
		return ReviewStatus.create();
	}

	submittedTo(): Effect.Effect<PendingReview> {
		return Effect.succeed(PendingReview.create());
	}

	dismissedBy(): Effect.Effect<PendingReview> {
		return Effect.succeed(PendingReview.create());
	}

	spawnedBy(agent: Agent): Effect.Effect<PendingReview, NotStarted> {
		return Effect.map(agent.spawn(Assignment.create()), () =>
			PendingReview.create(),
		);
	}
}

export { PendingReview };
