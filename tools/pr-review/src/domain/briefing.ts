import { Effect } from "effect";
import type { Definition } from "../generated/domain/definition.g.ts";
import type { Page } from "../generated/domain/page.g.ts";
import type { Rule } from "../generated/domain/rule.g.ts";
import type { Instructions } from "./instructions.ts";
import type { NoPage } from "./no-page.ts";
import type { NotAcknowledged } from "./not-acknowledged.ts";
import { NotDefined } from "./not-defined.ts";
import type { Defined } from "./task.ts";
import type { Term } from "./term.ts";

interface BriefingParts {
	readonly instructions: Instructions;
	readonly rules: Effect.Effect<readonly Rule[], NotAcknowledged>;
	readonly page: Effect.Effect<Page, NoPage | NotAcknowledged>;
	readonly glossary: readonly Defined[];
}

class Briefing {
	private readonly parts: BriefingParts;

	private constructor(parts: BriefingParts) {
		this.parts = parts;
		Object.freeze(this);
	}

	static of(parts: BriefingParts): Briefing {
		return new Briefing(parts);
	}

	instructions(): Instructions {
		return this.parts.instructions;
	}

	rules(): Effect.Effect<readonly Rule[], NotAcknowledged> {
		return this.parts.rules;
	}

	page(): Effect.Effect<Page, NoPage | NotAcknowledged> {
		return this.parts.page;
	}

	definitionOf(term: Term): Effect.Effect<Definition, NotDefined> {
		return Effect.fromNullishOr(
			this.parts.glossary.find(([defined]: Defined): boolean =>
				defined.isSameAs(term),
			),
		).pipe(
			Effect.map(([, definition]: Defined): Definition => definition),
			Effect.mapError((): NotDefined => NotDefined.create()),
		);
	}
}

export { Briefing };
