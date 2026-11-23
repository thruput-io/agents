import type {
	ChangedFile,
	LineRange,
	Path,
	Side,
	Thread,
} from "./contracts.g.ts";
import { intersect, union } from "./diff.ts";

interface ThreadRangeInput {
	readonly path: Path;
	readonly side: Side;
	readonly lines: LineRange;
	readonly state: Thread["state"];
}

interface ChangeSetFiles {
	readonly files: readonly ChangedFile[];
}

type RangeMap = ReadonlyMap<Path, readonly LineRange[]>;

interface RangeSides {
	readonly head: RangeMap;
	readonly base: RangeMap;
}

interface SurfaceFiles {
	files: { path: Path; added: LineRange[] }[];
}

const rangesFor = (map: RangeMap, path: Path): readonly LineRange[] => {
	const found = map.get(path);
	if (found === undefined) {
		return [];
	}
	return found;
};

export function threadRanges(threads: readonly ThreadRangeInput[]) {
	const sides = {
		head: new Map<Path, LineRange[]>(),
		base: new Map<Path, LineRange[]>(),
	};
	for (const thread of threads.filter(
		(candidate) => candidate.state !== "resolved",
	)) {
		sides[thread.side].set(
			thread.path,
			union(rangesFor(sides[thread.side], thread.path), [thread.lines]),
		);
	}
	return sides;
}

export const wholeSurface = (changeSet: ChangeSetFiles): SurfaceFiles => ({
	files: changeSet.files
		.map((file) => ({
			path: file.path,
			added: file.added,
		}))
		.filter((file) => file.added.length > 0),
});

export const narrowSurface = (
	changeSet: ChangeSetFiles,
	changedSince: RangeMap,
	threads: RangeSides,
): SurfaceFiles => ({
	files: changeSet.files
		.map((file) => ({
			path: file.path,
			added: intersect(
				file.added,
				union(
					rangesFor(changedSince, file.path),
					rangesFor(threads.head, file.path),
				),
			),
		}))
		.filter((file) => file.added.length > 0),
});
