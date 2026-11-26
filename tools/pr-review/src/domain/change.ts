import type { Probes } from "../generated/domain/probes.g.ts";
import { PendingReview } from "./pending-review.ts";

class Change {
	readonly #kind = "change";

	private constructor() {
		Object.freeze(this);
	}

	static create(): Change {
		return new Change();
	}

	toJSON(): { readonly kind: string } {
		return { kind: this.#kind };
	}

	review(_probes: Probes): PendingReview {
		return PendingReview.create();
	}
}

export { Change };
