import type { Definition } from "../generated/domain/definition.g.ts";
import type { Ruleset } from "../generated/domain/ruleset.g.ts";
import type { Term } from "../generated/domain/term.g.ts";
import type { Instructions } from "./instructions.ts";

class Briefing {
	private readonly held: Instructions;
	private readonly ruleset: Ruleset;
	private readonly definition: Definition;

	private constructor(
		instructions: Instructions,
		ruleset: Ruleset,
		definition: Definition,
	) {
		this.held = instructions;
		this.ruleset = ruleset;
		this.definition = definition;
		Object.freeze(this);
	}

	static of(
		instructions: Instructions,
		ruleset: Ruleset,
		definition: Definition,
	): Briefing {
		return new Briefing(instructions, ruleset, definition);
	}

	instructions(): Instructions {
		return this.held;
	}

	rules(): Ruleset {
		return this.ruleset;
	}

	definitionOf(_term: Term): Definition {
		return this.definition;
	}
}

export { Briefing };
