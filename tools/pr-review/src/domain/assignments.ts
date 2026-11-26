import { Effect } from "effect";
import type { NotStarted } from "../generated/domain/not-started.g.ts";
import type { Agent } from "./agent.ts";
import type { Assignment } from "./assignment.ts";

class Assignments {
	private readonly all: readonly Assignment[];

	private constructor(all: readonly Assignment[]) {
		this.all = all;
		Object.freeze(this);
	}

	static of(all: readonly Assignment[]): Assignments {
		return new Assignments(all);
	}

	spawnedBy(agent: Agent): Effect.Effect<Assignments, NotStarted> {
		return Effect.forEach(
			this.all,
			(assignment: Assignment): Effect.Effect<Assignment, NotStarted> =>
				agent.spawn(assignment),
		).pipe(Effect.map((): Assignments => this));
	}

	dismissedBy(agent: Agent): Effect.Effect<Assignments> {
		return Effect.forEach(
			this.all,
			(assignment: Assignment): Effect.Effect<Assignment> =>
				agent.terminate(assignment),
		).pipe(Effect.map((): Assignments => this));
	}
}

export { Assignments };
