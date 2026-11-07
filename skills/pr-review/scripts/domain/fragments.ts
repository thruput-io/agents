import type {
	ContextFragment,
	Fragment,
	LineNumber,
	LineNumberName,
	LineRange,
	LineText,
	NumberedLines,
	RemovedLines,
	SurfaceFragment,
} from "./contracts.g.ts";
import { isNullOrEmpty } from "./nullish.ts";

export function numbered(text: string): NumberedLines {
	const rawLines = text.split("\n");
	const lines = isNullOrEmpty(rawLines.at(-1))
		? rawLines.slice(0, -1)
		: rawLines;
	return Object.fromEntries(
		lines.map((line, index): [LineNumberName, LineText] => [
			String(index + 1),
			line,
		]),
	);
}

const isInsideRanges = (
	ranges: readonly LineRange[],
	line: LineNumber,
): boolean => ranges.some((range) => range.start <= line && line <= range.end);

export function fragments(
	lines: NumberedLines,
	added: readonly LineRange[],
	removed: readonly RemovedLines[],
): Fragment[] {
	const headFragments: (SurfaceFragment | ContextFragment)[] = [];
	for (const [numberText, text] of Object.entries(lines)) {
		const lineNumber: LineNumber = Number(numberText);
		const kind = isInsideRanges(added, lineNumber) ? "surface" : "context";
		const previous = headFragments.at(-1);
		const lineEntry = { [lineNumber]: text };
		if (!isNullOrEmpty(previous) && previous.kind === kind) {
			headFragments.splice(-1, 1, {
				...previous,
				lines: { ...previous.lines, ...lineEntry },
			});
		} else {
			headFragments.push(
				kind === "surface"
					? { kind, side: "head", lines: lineEntry }
					: { kind, lines: lineEntry },
			);
		}
	}
	const baseFragments: SurfaceFragment[] = removed.map((hunk) => ({
		kind: "surface",
		side: "base",
		lines: Object.fromEntries(
			hunk.content
				.split("\n")
				.map((lineText, index) => [hunk.start + index, lineText]),
		),
	}));
	return [...headFragments, ...baseFragments];
}

export const removedLines = (
	hunks: readonly RemovedLines[],
	ranges: readonly LineRange[],
): RemovedLines[] =>
	ranges.map((range) => {
		const hunk = hunks.find(
			(candidate) =>
				candidate.start <= range.start && range.end <= candidate.end,
		);
		if (isNullOrEmpty(hunk)) {
			throw new Error(
				`no removed hunk holds lines ${range.start}-${range.end}`,
			);
		}
		return {
			...range,
			content: hunk.content
				.split("\n")
				.slice(range.start - hunk.start, range.end - hunk.start + 1)
				.join("\n"),
		};
	});

export function span(lines: NumberedLines): LineRange {
	const numbers = Object.keys(lines).map((key): LineNumber => Number(key));
	return { start: Math.min(...numbers), end: Math.max(...numbers) };
}
