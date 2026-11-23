import type { assignmentMark, changeMark, probeMark } from "./marks.ts";

interface Probe {
	readonly [probeMark]: typeof probeMark;
}

interface Assignment {
	readonly [assignmentMark]: typeof assignmentMark;
	sameAs: (other: Assignment) => boolean;
}

interface Change {
	readonly [changeMark]: typeof changeMark;
	assignedTo: (probe: Probe) => Assignment;
}

export type { Assignment, Change, Probe };
