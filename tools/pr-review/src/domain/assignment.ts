import { Effect } from "effect";
import type { Acknowledgement } from "../generated/domain/acknowledgement.g.ts";
import { Progress } from "../generated/domain/progress.g.ts";
import { Briefing } from "./briefing.ts";
import { Cursor } from "./cursor.ts";
import type { Instructions } from "./instructions.ts";

type NoData = Readonly<Record<string, never>>;

class Assignment {
	readonly #data: NoData = {};

	private constructor() {
		Object.freeze(this);
	}

	static create(): Assignment {
		return new Assignment();
	}

	static dataOf(value: Assignment): NoData {
		return value.#data;
	}

	briefing(): Briefing {
		return Briefing.create();
	}

	cursor(): Cursor {
		return Cursor.create();
	}

	accepted(
		acknowledgement: Acknowledgement,
	): Effect.Effect<Acknowledgement, Instructions> {
		return Effect.succeed(acknowledgement);
	}

	progress(): Progress {
		return Progress.create();
	}
}

export { Assignment };
