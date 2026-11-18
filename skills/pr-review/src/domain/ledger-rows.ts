import type {
	LineNumber,
	Path,
	Row,
	Rule,
	RuleHeading,
	RuleRef,
	Side,
	SurfaceFile,
	SurfaceLineId,
	Violation,
} from "./contracts.g.ts";
import { isNullOrEmpty } from "./nullish.ts";

interface ResolvedSurfaceLine {
	readonly path: Path;
	readonly side: Side;
	readonly line: LineNumber;
}

function ruleName(row: Row): RuleHeading | Rule["id"] {
	if ("bookRule" in row) {
		return row.bookRule.heading;
	}
	return row.rule;
}

function rowRuleRef(row: Row): RuleRef {
	if ("bookRule" in row) {
		return row.bookRule;
	}
	return row.rule;
}

const resolveSurfaceLine = (
	lineId: SurfaceLineId | undefined,
	files: readonly SurfaceFile[],
): ResolvedSurfaceLine | null => {
	if (isNullOrEmpty(lineId)) {
		return null;
	}
	const file = files.find(
		(candidate) =>
			lineId.startsWith(`${candidate.path}:`) &&
			candidate.fragments.some(
				(fragment) =>
					fragment.kind === "surface" &&
					fragment.lines.some((line) => line.idToReportViolationOn === lineId),
			),
	);
	if (isNullOrEmpty(file)) {
		return null;
	}
	return {
		path: file.path,
		side: "head",
		line: Number(lineId.slice(file.path.length + 1)),
	};
};

const violationInside = (
	violation: Violation,
	files: readonly SurfaceFile[],
): boolean =>
	isNullOrEmpty(violation.idToReportViolationOn) ||
	!isNullOrEmpty(resolveSurfaceLine(violation.idToReportViolationOn, files));

export { resolveSurfaceLine, rowRuleRef, ruleName, violationInside };
