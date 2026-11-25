import { Effect } from "effect";
import type { Agent } from "../../domain/review.ts";

const idleAgent: Agent = {
	spawn: (assignment) => Effect.succeed(assignment),
	terminate: (assignment) => Effect.succeed(assignment),
};

export { idleAgent };
