import type { CodeUnderReview } from "./code-under-review.ts";
import type { Path, SurfaceFile } from "./contracts.g.ts";
import { changedFiles, parseNumstat } from "./diff.ts";
import { fragments, type NumberedLines, numbered } from "./fragments.ts";
import type { AdapterResolution, ReviewSnapshotInput } from "./host-adapter.ts";
import { oversizedFiles, tooLarge } from "./limits.ts";
import { isNullOrEmpty } from "./nullish.ts";
import type { RefusalRecorder } from "./review-baseline.ts";
import { CodeUnderReviewSnapshot } from "./review-snapshot.ts";
import type { SnapshotDirectory } from "./snapshot-directory.ts";

function linesAtHead(
	snapshotDir: SnapshotDirectory,
	path: Path,
): NumberedLines {
	const content = snapshotDir.readTextFile(path);
	if (isNullOrEmpty(content)) {
		return {};
	}
	return numbered(content);
}

function collectFileCounts(
	snapshotDir: SnapshotDirectory,
	input: ReviewSnapshotInput,
	linesByPath: Map<Path, NumberedLines>,
) {
	return parseNumstat(
		snapshotDir.numstat(input.baseCommit, input.headCommit),
	).map((entry) => {
		const lines = linesAtHead(snapshotDir, entry.path);
		linesByPath.set(entry.path, lines);
		return {
			path: entry.path,
			lines: Object.keys(lines).length,
			added: entry.added,
			deleted: entry.deleted,
		};
	});
}

async function resolveOversizedResult(
	fileCounts: ReturnType<typeof collectFileCounts>,
	input: ReviewSnapshotInput,
	refuse: RefusalRecorder,
): Promise<AdapterResolution | null> {
	const oversizedReasons = tooLarge(fileCounts);
	if (oversizedReasons.length === 0) {
		return null;
	}
	const refusalResult = await refuse(
		input.headCommit,
		oversizedReasons.join(", "),
	);
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

export async function buildReviewSnapshot(
	review: CodeUnderReview,
	snapshotDir: SnapshotDirectory,
	input: ReviewSnapshotInput,
	refuse: RefusalRecorder,
): Promise<AdapterResolution> {
	const linesByPath = new Map<Path, NumberedLines>();
	const fileCounts = collectFileCounts(snapshotDir, input, linesByPath);
	const oversized = await resolveOversizedResult(fileCounts, input, refuse);
	if (!isNullOrEmpty(oversized)) {
		return oversized;
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
	const surfaceFiles: SurfaceFile[] = surfaceSpec.files.map((entry) => {
		const headLines =
			linesByPath.get(entry.path) ?? linesAtHead(snapshotDir, entry.path);
		linesByPath.set(entry.path, headLines);
		return {
			path: entry.path,
			fragments: fragments({ path: entry.path, lines: headLines }, entry.added),
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
