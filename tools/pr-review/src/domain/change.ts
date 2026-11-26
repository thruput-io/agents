import type { Probes } from "../generated/domain/probes.g.ts";
import { PendingReview } from "./pending-review.ts";

type NoData = Readonly<Record<string, never>>;

class Change {
	readonly #data: NoData = {};

	private constructor() {
		Object.freeze(this);
	}

	static create(): Change {
		return new Change();
	}

	static dataOf(value: Change): NoData {
		return value.#data;
	}

	review(_probes: Probes): PendingReview {
		return PendingReview.create();
	}
}

export { Change };
