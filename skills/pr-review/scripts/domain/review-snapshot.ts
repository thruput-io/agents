import type { CodeUnderReview, ReviewState } from "./code-under-review.ts";
import type {
	Fragment,
	Host,
	Outcome,
	SurfaceFile,
	Threads,
} from "./contracts.g.ts";
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

function rendered(outcome: Outcome, ledgerTable: string): string {
	const findings = outcome.inline.map(
		(finding) =>
			`- \`${finding.path}:${finding.lines.start}-${finding.lines.end}\` (${finding.side}): ${finding.body}`,
	);
	const sections = [outcome.summary];
	if (findings.length > 0) {
		sections.push(findings.join("\n"));
	}
	sections.push(ledgerTable);
	return `${sections.join("\n\n")}\n`;
}

export { CodeUnderReviewSnapshot, rendered };
