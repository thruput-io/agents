import type { Assignment, Change, Probe } from "@bullet/domain";

const assign = (change: Change, probe: Probe): Assignment =>
	change.assignedTo(probe);

export { assign };
