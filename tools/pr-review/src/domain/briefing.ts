import { Definition } from "../generated/domain/definition.g.ts";
import { Ruleset } from "../generated/domain/ruleset.g.ts";
import type { Term } from "../generated/domain/term.g.ts";
import { Instructions } from "./instructions.ts";

class Briefing {
	readonly #kind = "briefing";

	private constructor() {
		Object.freeze(this);
	}

	static create(): Briefing {
		return new Briefing();
	}

	toJSON(): { readonly kind: string } {
		return { kind: this.#kind };
	}

	instructions(): Instructions {
		return Instructions.create();
	}

	rules(): Ruleset {
		return Ruleset.create();
	}

	definitionOf(_term: Term): Definition {
		return Definition.create();
	}
}

export { Briefing };
