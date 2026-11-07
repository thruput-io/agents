import { z } from "zod";
import {
	type ChangedFile,
	ChangedFileSchema,
	type LineNumber,
	type LineRange,
	type Path,
	type RemovedContent,
	type RemovedLines,
} from "./contracts.g.ts";
import { emptyAsNull, isNullOrEmpty } from "./nullish.ts";

const HUNK_START = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/u;
const DIFF_GIT_HEADER = /^(?=diff --git )/mu;
const DIFF_PATH_PREFIX = /^[ab]\//u;

const toLineNumber = (value: number): LineNumber => Math.max(1, value);

interface ParsedHunks {
	added: LineRange[];
	removed: RemovedLines[];
}

export function parseHunks(lines: readonly string[]): ParsedHunks {
	const added: LineRange[] = [];
	const removed: RemovedLines[] = [];
	let oldLine: LineNumber = 1;
	let currentLine: LineNumber = 1;
	for (const line of lines) {
		const match = HUNK_START.exec(line);
		if (!isNullOrEmpty(match)) {
			oldLine = toLineNumber(Number(match[1]));
			currentLine = toLineNumber(Number(match[2]));
		} else if (line.startsWith("+")) {
			const lastAdded = added.at(-1);
			if (!isNullOrEmpty(lastAdded) && lastAdded.end === currentLine - 1) {
				added.splice(-1, 1, { start: lastAdded.start, end: currentLine });
			} else {
				added.push({ start: currentLine, end: currentLine });
			}
			currentLine += 1;
		} else if (line.startsWith("-")) {
			const removedText: RemovedContent = line.slice(1);
			const lastRemoved = removed.at(-1);
			if (!isNullOrEmpty(lastRemoved) && lastRemoved.end === oldLine - 1) {
				removed.splice(-1, 1, {
					...lastRemoved,
					end: oldLine,
					content: `${lastRemoved.content}\n${removedText}`,
				});
			} else {
				removed.push({
					start: oldLine,
					end: oldLine,
					content: removedText,
				});
			}
			oldLine += 1;
		} else if (line.startsWith(" ")) {
			oldLine += 1;
			currentLine += 1;
		}
	}
	return { added, removed };
}

const pathsFromHeader = (
	headerLines: readonly string[],
	prefix: string,
): Path[] =>
	headerLines
		.filter((line) => line.startsWith(prefix))
		.map((line) => emptyAsNull(line.slice(prefix.length).split("\t")[0]))
		.filter(
			(candidate): candidate is string =>
				!isNullOrEmpty(candidate) && candidate !== "/dev/null",
		)
		.map((candidate) => candidate.replace(DIFF_PATH_PREFIX, ""));

function fileOfSection(section: string): ChangedFile[] {
	const sectionLines = section.split("\n");
	const firstHunkIndex = sectionLines.findIndex((line) =>
		HUNK_START.test(line),
	);
	const headerLines =
		firstHunkIndex === -1
			? sectionLines
			: sectionLines.slice(0, firstHunkIndex);
	const [path] = [
		...pathsFromHeader(headerLines, "+++ "),
		...pathsFromHeader(headerLines, "--- "),
	];
	if (isNullOrEmpty(path)) {
		return [];
	}
	const hunkLines =
		firstHunkIndex === -1 ? [] : sectionLines.slice(firstHunkIndex);
	return [{ path, ...parseHunks(hunkLines) }];
}

const parseDiff = (text: string): ChangedFile[] =>
	text
		.split(DIFF_GIT_HEADER)
		.filter((section) => section.startsWith("diff --git "))
		.flatMap(fileOfSection);

export const changedFiles = (text: string): ChangedFile[] =>
	z.array(ChangedFileSchema).parse(parseDiff(text));

export const intersect = (
	rangesA: readonly LineRange[],
	rangesB: readonly LineRange[],
): LineRange[] =>
	rangesA.flatMap((rangeA) =>
		rangesB
			.map((rangeB) => ({
				start: Math.max(rangeA.start, rangeB.start),
				end: Math.min(rangeA.end, rangeB.end),
			}))
			.filter((range) => range.start <= range.end),
	);

export function union(
	rangesA: readonly LineRange[],
	rangesB: readonly LineRange[],
): LineRange[] {
	const merged: LineRange[] = [];
	const sorted = [...rangesA, ...rangesB].sort(
		(left, right) => left.start - right.start,
	);
	for (const range of sorted) {
		const lastRange = merged.at(-1);
		if (!isNullOrEmpty(lastRange) && range.start <= lastRange.end + 1) {
			merged.splice(-1, 1, {
				start: lastRange.start,
				end: Math.max(lastRange.end, range.end),
			});
		} else {
			merged.push({ start: range.start, end: range.end });
		}
	}
	return merged;
}
