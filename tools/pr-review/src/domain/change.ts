import type { Probes } from "../generated/domain/probes.g.ts";
import type { PendingReview } from "./pending-review.ts";

class Change {
	private readonly pending: PendingReview;

	private constructor(pending: PendingReview) {
		this.pending = pending;
		Object.freeze(this);
	}

	static of(pending: PendingReview): Change {
		return new Change(pending);
	}

	review(_probes: Probes): PendingReview {
		return this.pending;
	}
}

export { Change };
