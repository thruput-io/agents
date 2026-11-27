import { Effect } from "effect";
import { z } from "zod";
import { Rule } from "../generated/domain/rule.g.ts";
import { NotAssigned } from "./not-assigned.ts";

class Verdict {
	private readonly rule: Rule;

	private constructor(rule: Rule) {
		this.rule = rule;
		Object.freeze(this);
	}

	static readonly codec = z.codec(
		z.object({ rule: Rule.codec }),
		z.custom<Verdict>((value): boolean => value instanceof Verdict),
		{
			decode: ({ rule }: { readonly rule: Rule }): Verdict => new Verdict(rule),
			encode: (verdict: Verdict): { readonly rule: Rule } => ({
				rule: verdict.rule,
			}),
		},
	);

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
