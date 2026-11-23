import type { Assignment, Change, Probe } from "./domain.ts";

const assign = (change: Change, probe: Probe): Assignment =>
	change.assignedTo(probe);

const readsAField = (change: Change): unknown =>
	// @ts-expect-error a field of the generated data is not on the domain interface
	change.author;

const passesTheWrongType = (change: Change, assignment: Assignment): Assignment =>
	// @ts-expect-error an assignment is not a probe
	change.assignedTo(assignment);

const buildsByHand = (): Change =>
	// @ts-expect-error a plain object is not a change
	({ assignedTo: (): Assignment => buildsByHand().assignedTo({}) });

export { assign, buildsByHand, passesTheWrongType, readsAField };
