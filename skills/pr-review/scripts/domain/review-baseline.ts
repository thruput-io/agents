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

interface ReviewBaseline {
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

const initialReview: ReviewBaseline = {
	commitsToFetch: (baseCommit, headCommit) => [baseCommit, headCommit],
	surfaceSpec: (_snapshotDir, _headCommit, files) => wholeSurface({ files }),
	alreadyReviewed: (headCommit) => ({
		kind: "already-reviewed",
		headCommit,
		location: "",
	}),
};

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

function reviewBaselineFrom(priorCommit: HeadCommit | null): ReviewBaseline {
	if (isNullOrEmpty(priorCommit)) {
		return initialReview;
	}
	return new IncrementalReview(priorCommit);
}

type RefusalRecorder = (
	headCommit: HeadCommit,
	reason: Summary,
) => Promise<Summary | HostError>;

function refusalRecorder(
	existingRefusal: Summary | null,
	post: RefusalRecorder,
): RefusalRecorder {
	if (!isNullOrEmpty(existingRefusal)) {
		return () => Promise.resolve(existingRefusal);
	}
	return post;
}

export type { RefusalRecorder, ReviewBaseline };
export { refusalRecorder, reviewBaselineFrom };
