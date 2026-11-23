import type { Assignment, Change, Probe } from "./domain.ts";
import type { AssignmentData, ChangeData, ProbeData } from "./generated.ts";
import { assignmentMark, changeMark, probeMark } from "./marks.ts";

const minted = new WeakSet<object>();

const mint = <Whole extends object>(whole: Whole): Readonly<Whole> => {
	const frozen = Object.freeze(whole);

	minted.add(frozen);

	return frozen;
};

const isMinted = (value: unknown): boolean =>
	typeof value === "object" && value !== null && minted.has(value);

function assertMinted<Domain extends object, Data>(
	value: Domain,
): asserts value is Domain & Data {
	if (!minted.has(value)) {
		throw new TypeError("the object was not minted by the domain");
	}
}

const dataOfProbe = (probe: Probe): ProbeData => {
	assertMinted<Probe, ProbeData>(probe);

	return probe;
};

const dataOfChange = (change: Change): ChangeData => {
	assertMinted<Change, ChangeData>(change);

	return change;
};

const dataOfAssignment = (assignment: Assignment): AssignmentData => {
	assertMinted<Assignment, AssignmentData>(assignment);

	return assignment;
};

const probeFrom = (data: ProbeData): Probe =>
	mint({ ...data, [probeMark]: probeMark });

const assignmentFrom = (data: AssignmentData): Assignment =>
	mint({
		...data,
		[assignmentMark]: assignmentMark,
		sameAs: (other: Assignment): boolean => {
			const theirs = dataOfAssignment(other);

			return theirs.author === data.author && theirs.probe === data.probe;
		},
	});

const changeFrom = (data: ChangeData): Change =>
	mint({
		...data,
		[changeMark]: changeMark,
		assignedTo: (probe: Probe): Assignment => {
			const { name, group } = dataOfProbe(probe);

			return assignmentFrom({ author: data.author, probe: name, group });
		},
	});

export {
	assignmentFrom,
	changeFrom,
	dataOfAssignment,
	dataOfChange,
	dataOfProbe,
	isMinted,
	probeFrom,
};
