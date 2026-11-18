import type { CodeUnderReview, ReviewState } from "./code-under-review.ts";
import type { Fragment, Host, SurfaceFile, Threads } from "./contracts.g.ts";
import type { SnapshotPort } from "./ports.ts";

class CodeUnderReviewSnapshot implements CodeUnderReview {
	readonly #review: CodeUnderReview;
	readonly #snapShot: SnapshotPort;
	private constructor(review: CodeUnderReview, snapShot: SnapshotPort) {
		this.#review = review;
		this.#snapShot = snapShot;
	}
	static from(
		review: CodeUnderReview,
		snapShot: SnapshotPort,
	): CodeUnderReviewSnapshot {
		return new CodeUnderReviewSnapshot(review, snapShot);
	}
	get snapShot(): SnapshotPort {
		return this.#snapShot;
	}
	host(): Host {
		return this.#review.host();
	}
	surface(): readonly SurfaceFile[] {
		return this.#review.surface();
	}
	fragments(): readonly Fragment[] {
		return this.#review.fragments();
	}
	threads(): Threads {
		return this.#review.threads();
	}
	withReview(...state: ReviewState): CodeUnderReviewSnapshot {
		return new CodeUnderReviewSnapshot(
			this.#review.withReview(...state),
			this.#snapShot,
		);
	}
}

export { CodeUnderReviewSnapshot };
