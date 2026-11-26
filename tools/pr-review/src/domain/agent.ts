import type { Effect } from "effect";
import type { NotStarted } from "../generated/domain/not-started.g.ts";
import type { Assignment } from "./assignment.ts";

interface Agent {
	spawn: (assignment: Assignment) => Effect.Effect<Assignment, NotStarted>;
	terminate: (assignment: Assignment) => Effect.Effect<Assignment>;
}

export type { Agent };
