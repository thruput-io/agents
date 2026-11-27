import { Effect } from "effect";
import type { Rule } from "../domain/rule.ts";
import type { Folding } from "./folding.ts";
import { NotAssigned } from "./not-assigned.ts";

class Verdict {
	private readonly rule: Rule;

	private constructor(rule: Rule) {
		this.rule = rule;
		Object.freeze(this);
	}

	static on(rule: Rule): Verdict {
		return new Verdict(rule);
	}

	foldedBy<Foreign>(contract: Folding<Rule, Foreign>): Foreign {
		return contract.encode(this.rule);
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
