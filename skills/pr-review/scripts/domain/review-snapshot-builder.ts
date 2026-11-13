import type { AdapterResolution, ReviewSnapshotInput } from "./adapter.ts";
import type { CodeUnderReview } from "./code-under-review.ts";
import type {
	ChangedFile,
	HeadCommit,
	HostError,
	Path,
	Summary,
	SurfaceFile,
} from "./contracts.g.ts";
import { changedFiles } from "./diff.ts";
import {
	fragments,
	type NumberedLines,
	numbered,
	removedLines,
} from "./fragments.ts";
import { isNullOrEmpty, nonnull } from "./nullish.ts";
import { CodeUnderReviewSnapshot } from "./review-snapshot.ts";
import { oversizedFiles, tooLarge } from "./ruleset.ts";
import type { SnapshotDirectory } from "./snapshot-directory.ts";
import { narrowSurface, threadRanges, wholeSurface } from "./surface.ts";

function narrowed(
	snapshotDir: SnapshotDirectory,
	input: ReviewSnapshotInput,
	files: readonly ChangedFile[],
) {
	const prior = nonnull(input.priorCommit);
	const since = snapshotDir.diff(prior, input.headCommit);
	const changedSince = new Map(
		changedFiles(since).map((file) => [file.path, file.added] as const),
	);
	return narrowSurface({ files }, changedSince, threadRanges(input.threads));
}

function linesAtHead(
	snapshotDir: SnapshotDirectory,
	path: Path,
): NumberedLines {
	const content = snapshotDir.readTextFile(path);
	return isNullOrEmpty(content) ? {} : numbered(content);
}

export async function buildReviewSnapshot(
	review: CodeUnderReview,
	snapshotDir: SnapshotDirectory,
	input: ReviewSnapshotInput,
	refuse: (
		headCommit: HeadCommit,
		reason: Summary,
	) => Promise<Summary | HostError>,
): Promise<AdapterResolution> {
	const diffText = snapshotDir.diff(input.baseCommit, input.headCommit);
	const files = changedFiles(diffText);
	const linesByPath = new Map(
		files.map((file) => [file.path, linesAtHead(snapshotDir, file.path)]),
	);
	const fileCounts = files.map((file) => ({
		path: file.path,
		lines: Object.keys(nonnull(linesByPath.get(file.path))).length,
		added: file.added.reduce(
			(sum, range) => sum + range.end - range.start + 1,
			0,
		),
	}));
	const oversizedReasons = tooLarge(fileCounts);
	if (oversizedReasons.length > 0) {
		const reason = oversizedReasons.join(", ");
		const refusalResult = isNullOrEmpty(input.existingRefusal)
			? await refuse(input.headCommit, reason)
			: input.existingRefusal;
		if (typeof refusalResult !== "string") {
			return refusalResult;
		}
		return {
			kind: "too-large",
			headCommit: input.headCommit,
			files: oversizedFiles(fileCounts),
			location: refusalResult,
		};
	}
	const surfaceSpec = isNullOrEmpty(input.priorCommit)
		? wholeSurface({ files })
		: narrowed(snapshotDir, input, files);
	if (surfaceSpec.files.length === 0) {
		return {
			kind: "already-reviewed",
			headCommit: input.headCommit,
			location: String(input.priorCommit),
		};
	}
	const surfaceFiles: SurfaceFile[] = surfaceSpec.files.map((entry) => {
		const changed = nonnull(files.find((file) => file.path === entry.path));
		return {
			path: entry.path,
			fragments: fragments(
				nonnull(linesByPath.get(entry.path)),
				entry.added,
				removedLines(changed.removed, entry.removed),
			),
		};
	});
	const snapshot = CodeUnderReviewSnapshot.from(
		review.withReview(
			surfaceFiles,
			surfaceFiles.flatMap((file) => file.fragments),
			{ threads: [...input.threads] },
		),
		snapshotDir,
	);
	return {
		kind: "ready",
		headCommit: input.headCommit,
		change: input.change,
		snapshot,
	};
}
