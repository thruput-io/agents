import type {
	ContextFragment,
	Fragment,
	LineNumber,
	LineRange,
	LineText,
	Path,
	SurfaceFragment,
	SurfaceLine,
} from "./contracts.g.ts";
import { isNullOrEmpty } from "./nullish.ts";

export type NumberedLines = Readonly<Record<string, LineText>>;

export function numbered(text: string): NumberedLines {
	const rawLines = text.split("\n");
	const lines = isNullOrEmpty(rawLines.at(-1))
		? rawLines.slice(0, -1)
		: rawLines;
	return Object.fromEntries(
		lines.map((line, index): [string, LineText] => [String(index + 1), line]),
	);
}

const isInsideRanges = (
	ranges: readonly LineRange[],
	line: LineNumber,
): boolean => ranges.some((range) => range.start <= line && line <= range.end);

export function fragments(
	file: { readonly path: Path; readonly lines: NumberedLines },
	added: readonly LineRange[],
): Fragment[] {
	const headFragments: (SurfaceFragment | ContextFragment)[] = [];
	for (const [numberText, text] of Object.entries(file.lines)) {
		const lineNumber: LineNumber = Number(numberText);
		const isSurface = isInsideRanges(added, lineNumber);
		const previous = headFragments.at(-1);
		if (isSurface) {
			const surfaceLine: SurfaceLine = {
				idToReportViolationOn: `${file.path}:${lineNumber}`,
				text,
			};
			if (!isNullOrEmpty(previous) && previous.kind === "surface") {
				headFragments.splice(-1, 1, {
					...previous,
					lines: [...previous.lines, surfaceLine],
				});
			} else {
				headFragments.push({
					kind: "surface",
					side: "head",
					lines: [surfaceLine],
				});
			}
		} else if (!isNullOrEmpty(previous) && previous.kind === "context") {
			headFragments.splice(-1, 1, {
				...previous,
				lines: [...previous.lines, text],
			});
		} else {
			headFragments.push({ kind: "context", lines: [text] });
		}
	}
	return headFragments;
}
