import type { AdapterResolution } from "./adapter.ts";
import type {
	ChangedFile,
	HeadCommit,
	HostError,
	Summary,
	Thread,
} from "./contracts.g.ts";
import { changedFiles } from "./diff.ts";
import { isNullOrEmpty } from "./nullish.ts";
import type { SnapshotDirectory } from "./snapshot-directory.ts";
import { narrowSurface, threadRanges, wholeSurface } from "./surface.ts";

type SurfaceSpec = ReturnType<typeof wholeSurface>;

export interface ReviewBaseline {
	commitsToFetch: (
		baseCommit: HeadCommit,
		headCommit: HeadCommit,
	) => readonly HeadCommit[];
	surfaceSpec: (
		snapshotDir: SnapshotDirectory,
		headCommit: HeadCommit,
		files: readonly ChangedFile[],
		threads: readonly Thread[],
	) => SurfaceSpec;
	alreadyReviewed: (headCommit: HeadCommit) => AdapterResolution;
}

class InitialReview implements ReviewBaseline {
	commitsToFetch(
		baseCommit: HeadCommit,
		headCommit: HeadCommit,
	): readonly HeadCommit[] {
		return [baseCommit, headCommit];
	}

	surfaceSpec(
		_snapshotDir: SnapshotDirectory,
		_headCommit: HeadCommit,
		files: readonly ChangedFile[],
	): SurfaceSpec {
		return wholeSurface({ files });
	}

	alreadyReviewed(headCommit: HeadCommit): AdapterResolution {
		return {
			kind: "already-reviewed",
			headCommit,
			location: "",
		};
	}
}

class IncrementalReview implements ReviewBaseline {
	readonly #priorCommit: HeadCommit;

	constructor(priorCommit: HeadCommit) {
		this.#priorCommit = priorCommit;
	}

	commitsToFetch(
		baseCommit: HeadCommit,
		headCommit: HeadCommit,
	): readonly HeadCommit[] {
		return [baseCommit, this.#priorCommit, headCommit];
	}

	surfaceSpec(
		snapshotDir: SnapshotDirectory,
		headCommit: HeadCommit,
		files: readonly ChangedFile[],
		threads: readonly Thread[],
	): SurfaceSpec {
		const since = snapshotDir.diff(this.#priorCommit, headCommit);
		const changedSince = new Map(
			changedFiles(since).map((file) => [file.path, file.added] as const),
		);
		return narrowSurface({ files }, changedSince, threadRanges(threads));
	}

	alreadyReviewed(headCommit: HeadCommit): AdapterResolution {
		return {
			kind: "already-reviewed",
			headCommit,
			location: this.#priorCommit,
		};
	}
}

export function reviewBaselineFrom(
	priorCommit: HeadCommit | null,
): ReviewBaseline {
	if (isNullOrEmpty(priorCommit)) {
		return new InitialReview();
	}
	return new IncrementalReview(priorCommit);
}

export type RefusalRecorder = (
	headCommit: HeadCommit,
	reason: Summary,
) => Promise<Summary | HostError>;

export function refusalRecorder(
	existingRefusal: Summary | null,
	post: RefusalRecorder,
): RefusalRecorder {
	if (!isNullOrEmpty(existingRefusal)) {
		return () => Promise.resolve(existingRefusal);
	}
	return post;
}
