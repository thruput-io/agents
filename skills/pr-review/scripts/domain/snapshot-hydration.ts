import type { AdapterResolution, RemotePullRequest } from "./adapter.ts";
import type { CodeUnderReview } from "./code-under-review.ts";
import type {
	ChangedFile,
	HeadCommit,
	NumberedLines,
	Path,
	Summary,
	SurfaceFile,
} from "./contracts.g.ts";
import { changedFiles } from "./diff.ts";
import { fragments, numbered, removedLines } from "./fragments.ts";
import { isNullOrEmpty, nonnull } from "./nullish.ts";
import { CodeUnderReviewSnapshot } from "./review-snapshot.ts";
import { FILE_LINES, isDoc, isLock, isTest, tooLarge } from "./ruleset.ts";
import type { SnapshotDirectory } from "./snapshot-directory.ts";
import { narrowSurface, threadRanges, wholeSurface } from "./surface.ts";

function narrowed(
	snapshotDir: SnapshotDirectory,
	remote: RemotePullRequest,
	files: readonly ChangedFile[],
) {
	const prior = nonnull(remote.priorCommit);
	snapshotDir.git(["fetch", "--quiet", "--no-tags", remote.remoteUrl, prior]);
	const since = snapshotDir.git([
		"diff",
		"--no-renames",
		"--unified=0",
		`${prior}..${remote.headCommit}`,
	]);
	const changedSince = new Map(
		changedFiles(since).map((file) => [file.path, file.added] as const),
	);
	return narrowSurface({ files }, changedSince, threadRanges(remote.threads));
}

function linesAtHead(
	snapshotDir: SnapshotDirectory,
	headCommit: HeadCommit,
	path: Path,
): NumberedLines {
	const exists = snapshotDir
		.git(["ls-tree", "--name-only", headCommit, "--", path])
		.trim();
	return isNullOrEmpty(exists)
		? {}
		: numbered(snapshotDir.gitRaw(["show", `${headCommit}:${path}`]));
}

export async function hydrateSnapshot(
	review: CodeUnderReview,
	snapshotDir: SnapshotDirectory,
	remote: RemotePullRequest,
	refuse: (headCommit: HeadCommit, reason: Summary) => Promise<Summary>,
): Promise<AdapterResolution> {
	const fetchRef = (ref: string) =>
		snapshotDir.git(["fetch", "--quiet", "--no-tags", remote.remoteUrl, ref]);
	snapshotDir.git(["init", "--quiet"]);
	fetchRef(remote.baseRef);
	const baseCommit = snapshotDir.git(["rev-parse", "FETCH_HEAD"]).trim();
	fetchRef(remote.headRef);
	snapshotDir.git(["checkout", "--quiet", "--detach", "FETCH_HEAD"]);
	const mergeBase = snapshotDir
		.git(["merge-base", baseCommit, remote.headCommit])
		.trim();
	const diffText = snapshotDir.git([
		"diff",
		"--no-renames",
		"--unified=0",
		`${mergeBase}..${remote.headCommit}`,
	]);
	const files = changedFiles(diffText);
	const linesByPath = new Map(
		files.map((file) => [
			file.path,
			linesAtHead(snapshotDir, remote.headCommit, file.path),
		]),
	);
	const fileCounts = files.map((file) => ({
		path: file.path,
		lines: Object.keys(nonnull(linesByPath.get(file.path))).length,
	}));
	const oversizedReasons = tooLarge(fileCounts);
	if (oversizedReasons.length > 0) {
		const reason = oversizedReasons.join(", ");
		const location = isNullOrEmpty(remote.existingRefusal)
			? await refuse(remote.headCommit, reason)
			: remote.existingRefusal;
		const oversizedFiles = fileCounts
			.filter(
				(file) =>
					!(isTest(file.path) || isLock(file.path) || isDoc(file.path)) &&
					file.lines > FILE_LINES,
			)
			.map((file) => file.path);
		return {
			kind: "too-large",
			headCommit: remote.headCommit,
			files: oversizedFiles,
			location,
		};
	}
	const surfaceSpec = isNullOrEmpty(remote.priorCommit)
		? wholeSurface({ files })
		: narrowed(snapshotDir, remote, files);
	if (surfaceSpec.files.length === 0) {
		return {
			kind: "already-reviewed",
			headCommit: remote.headCommit,
			location: String(remote.priorCommit),
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
			{ threads: [...remote.threads] },
		),
		snapshotDir,
	);
	return {
		kind: "ready",
		headCommit: remote.headCommit,
		change: remote.change,
		snapshot,
	};
}
