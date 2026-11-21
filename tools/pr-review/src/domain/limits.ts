import { z } from "zod";
import { type LineNumber, type Path, PathSchema } from "./contracts.g.ts";

const MAX_FILE_LINES: LineNumber = 1000;
const MAX_ADDED_LINES: LineNumber = 1600;
const MAX_CHANGED_FILES = 250;
const MAX_DIFF_LINES: LineNumber = 8000;

const FILE_LIMIT_EXCEEDED = "exceeds the 1000-line review limit";
const DIFF_LIMIT_EXCEEDED =
	"pull request exceeds review size limits (max 250 files, 1600 added lines, 8000 changed lines)";

const FileLineCountSchema = z.object({
	path: PathSchema,
	lines: z.number().int().min(0),
	added: z.number().int().min(0),
	deleted: z.number().int().min(0),
});

type FileLineCount = z.infer<typeof FileLineCountSchema>;

const diffExceeded = (counts: readonly FileLineCount[]): boolean => {
	if (counts.length > MAX_CHANGED_FILES) {
		return true;
	}
	let totalAdded = 0;
	let totalChanged = 0;
	for (const file of counts) {
		totalAdded += file.added;
		totalChanged += file.added + file.deleted;
	}
	return totalAdded > MAX_ADDED_LINES || totalChanged > MAX_DIFF_LINES;
};

function oversizedFiles(counts: readonly FileLineCount[]): Path[] {
	if (diffExceeded(counts)) {
		return counts.map((file) => file.path);
	}
	return counts
		.filter((file) => file.lines > MAX_FILE_LINES)
		.map((file) => file.path);
}

function tooLarge(counts: readonly FileLineCount[]): string[] {
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

export type { FileLineCount };
export {
	DIFF_LIMIT_EXCEEDED,
	FILE_LIMIT_EXCEEDED,
	FileLineCountSchema,
	MAX_ADDED_LINES,
	MAX_CHANGED_FILES,
	MAX_DIFF_LINES,
	MAX_FILE_LINES,
	oversizedFiles,
	tooLarge,
};
