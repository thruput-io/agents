import type {
	CodeUnderReview,
	ReviewState,
} from "../domain/code-under-review.ts";
import type {
	Fragment,
	Host,
	SurfaceFile,
	Threads,
} from "../domain/contracts.g.ts";
import type { SnapshotDirectory } from "./snapshot-directory.ts";

class CodeUnderReviewSnapshot implements CodeUnderReview {
	readonly #review: CodeUnderReview;
	readonly #snapShot: SnapshotDirectory;
	private constructor(review: CodeUnderReview, snapShot: SnapshotDirectory) {
		this.#review = review;
		this.#snapShot = snapShot;
	}
	static from(
		review: CodeUnderReview,
		snapShot: SnapshotDirectory,
	): CodeUnderReviewSnapshot {
		return new CodeUnderReviewSnapshot(review, snapShot);
	}
	get snapShot(): SnapshotDirectory {
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
