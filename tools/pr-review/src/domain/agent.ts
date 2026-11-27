import type { Effect } from "effect";
import type { Assignment } from "./assignment.ts";
import type { NotStarted } from "./not-started.ts";

interface Agent {
	spawn: (assignment: Assignment) => Effect.Effect<Assignment, NotStarted>;
	terminate: (assignment: Assignment) => Effect.Effect<Assignment>;
}

export type { Agent };
