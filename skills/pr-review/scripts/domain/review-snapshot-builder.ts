import type { AdapterResolution, ReviewSnapshotInput } from "./adapter.ts";
import type { CodeUnderReview } from "./code-under-review.ts";
import type { Path, SurfaceFile } from "./contracts.g.ts";
import { changedFiles, parseNumstat } from "./diff.ts";
import {
	fragments,
	indexSurface,
	type NumberedLines,
	numbered,
	removedLines,
} from "./fragments.ts";
import { oversizedFiles, tooLarge } from "./limits.ts";
import { isNullOrEmpty, nonnull } from "./nullish.ts";
import type { RefusalRecorder } from "./review-baseline.ts";
import { CodeUnderReviewSnapshot } from "./review-snapshot.ts";
import type { SnapshotDirectory } from "./snapshot-directory.ts";

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
	refuse: RefusalRecorder,
): Promise<AdapterResolution> {
	const numstatEntries = parseNumstat(
		snapshotDir.numstat(input.baseCommit, input.headCommit),
	);
	const linesByPath = new Map<Path, NumberedLines>();
	const fileCounts = numstatEntries.map((entry) => {
		const lines = linesAtHead(snapshotDir, entry.path);
		linesByPath.set(entry.path, lines);
		return {
			path: entry.path,
			lines: Object.keys(lines).length,
			added: entry.added,
			deleted: entry.deleted,
		};
	});
	const oversizedReasons = tooLarge(fileCounts);
	if (oversizedReasons.length > 0) {
		const reason = oversizedReasons.join(", ");
		const refusalResult = await refuse(input.headCommit, reason);
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
	const diffText = snapshotDir.diff(input.baseCommit, input.headCommit);
	const files = changedFiles(diffText);
	const surfaceSpec = input.baseline.surfaceSpec(
		snapshotDir,
		input.headCommit,
		files,
		input.threads,
	);
	if (surfaceSpec.files.length === 0) {
		return input.baseline.alreadyReviewed(input.headCommit);
	}
	const surfaceFiles: SurfaceFile[] = indexSurface(
		surfaceSpec.files.map((entry) => {
			const changed = nonnull(files.find((file) => file.path === entry.path));
			const headLines =
				linesByPath.get(entry.path) ?? linesAtHead(snapshotDir, entry.path);
			linesByPath.set(entry.path, headLines);
			return {
				path: entry.path,
				fragments: fragments(
					headLines,
					entry.added,
					removedLines(changed.removed, entry.removed),
				),
			};
		}),
	);
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
