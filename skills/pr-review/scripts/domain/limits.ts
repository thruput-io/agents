import type { LineNumber, Path } from "./contracts.g.ts";

/** Hard per-file line limit at head, reached strictly before host diff caps. */
export const MAX_FILE_LINES: LineNumber = 1000;
/** Hard total added-line limit across all changed files. */
export const MAX_ADDED_LINES: LineNumber = 1600;
/** Hard changed-file count limit, reached strictly before GitHub's 300-file diff cap. */
export const MAX_CHANGED_FILES = 250;
/** Hard total changed-line (added + deleted) limit, reached strictly before GitHub's 20,000-line / 1 MB diff caps. */
export const MAX_DIFF_LINES: LineNumber = 8000;

export const FILE_LIMIT_EXCEEDED = "exceeds the 1000-line review limit";
export const DIFF_LIMIT_EXCEEDED =
	"pull request exceeds review size limits (max 250 files, 1600 added lines, 8000 changed lines)";

export interface FileLineCount {
	readonly path: Path;
	readonly lines: number;
	readonly added: number;
	readonly deleted?: number;
}

const diffExceeded = (counts: readonly FileLineCount[]): boolean => {
	if (counts.length > MAX_CHANGED_FILES) {
		return true;
	}
	let totalAdded = 0;
	let totalChanged = 0;
	for (const file of counts) {
		totalAdded += file.added;
		totalChanged += file.added + (file.deleted ?? 0);
	}
	return totalAdded > MAX_ADDED_LINES || totalChanged > MAX_DIFF_LINES;
};

/**
 * Returns every changed file path violating the hard review size limits,
 * applying uniformly across all changed files with no rulebook exemptions.
 */
export function oversizedFiles(counts: readonly FileLineCount[]): Path[] {
	if (diffExceeded(counts)) {
		return counts.map((file) => file.path);
	}
	return counts
		.filter((file) => file.lines > MAX_FILE_LINES)
		.map((file) => file.path);
}

/**
 * Evaluates hard operational size constraints against changed file counts
 * so oversized PRs fail before exhausting host APIs or Node buffers.
 */
export function tooLarge(counts: readonly FileLineCount[]): string[] {
	const fileReasons = counts
		.filter((file) => file.lines > MAX_FILE_LINES)
		.map(
			(file) =>
				`${file.path} is ${file.lines} lines long (${FILE_LIMIT_EXCEEDED})`,
		);
	if (diffExceeded(counts)) {
		return [...fileReasons, DIFF_LIMIT_EXCEEDED];
	}
	return fileReasons;
}
