import { Effect } from "effect";
import type { Acknowledgement } from "../generated/domain/acknowledgement.g.ts";
import type { Progress } from "../generated/domain/progress.g.ts";
import type { Briefing } from "./briefing.ts";
import type { Cursor } from "./cursor.ts";
import type { Instructions } from "./instructions.ts";

interface AssignmentParts {
	readonly briefing: Briefing;
	readonly cursor: Cursor;
	readonly progress: Progress;
	readonly expected: Acknowledgement;
	readonly detailed: Instructions;
}

class Assignment {
	private readonly parts: AssignmentParts;

	private constructor(parts: AssignmentParts) {
		this.parts = parts;
		Object.freeze(this);
	}

	static of(parts: AssignmentParts): Assignment {
		return new Assignment(parts);
	}

	briefing(): Briefing {
		return this.parts.briefing;
	}

	cursor(): Cursor {
		return this.parts.cursor;
	}

	progress(): Progress {
		return this.parts.progress;
	}

	accepted(
		sent: Acknowledgement,
	): Effect.Effect<Acknowledgement, Instructions> {
		return Effect.succeed(sent).pipe(
			Effect.filterOrFail(
				(acknowledgement: Acknowledgement): boolean =>
					this.parts.expected.isSameAs(acknowledgement),
				(): Instructions => this.parts.detailed,
			),
		);
	}
}

export { Assignment };
