import { Effect } from "effect";
import type { Agent } from "../../domain/agent.ts";
import type { Assignment } from "../../domain/assignment.ts";

const idleAgent: Agent = {
	spawn: (assignment: Assignment): Effect.Effect<Assignment> =>
		Effect.succeed(assignment),
	terminate: (assignment: Assignment): Effect.Effect<Assignment> =>
		Effect.succeed(assignment),
};

export { idleAgent };
