import { Effect } from "effect";
import { NotAssigned } from "../generated/domain/not-assigned.g.ts";
import type { Rule } from "../generated/domain/rule.g.ts";

class Verdict {
	private readonly rule: Rule;

	private constructor(rule: Rule) {
		this.rule = rule;
		Object.freeze(this);
	}

	static on(rule: Rule): Verdict {
		return new Verdict(rule);
	}

	isOn(rule: Rule): boolean {
		return this.rule.isSameAs(rule);
	}

	replaces(earlier: Verdict): boolean {
		return earlier.isOn(this.rule);
	}

	among(rules: readonly Rule[]): Effect.Effect<Verdict, NotAssigned> {
		return Effect.succeed(this).pipe(
			Effect.filterOrFail(
				(verdict: Verdict): boolean =>
					rules.some((rule: Rule): boolean => verdict.isOn(rule)),
				(): NotAssigned => NotAssigned.create(),
			),
		);
	}
}

export { Verdict };
