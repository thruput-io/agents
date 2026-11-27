import { Effect } from "effect";
import type { Folding } from "./folding.ts";
import { NotValid } from "./not-valid.ts";

const WRAPPING = /["'`‘’“”[\]]/gu;
const SEPARATORS = /[\s_-]+/gu;
const EDGES = /^-+|-+$/gu;

const slugOf = (text: string): string =>
	text
		.toLowerCase()
		.replace(WRAPPING, "")
		.replace(SEPARATORS, "-")
		.replace(EDGES, "");

class Term {
	private readonly slug: string;

	private constructor(slug: string) {
		this.slug = slug;
		Object.freeze(this);
	}

	static of(text: string): Effect.Effect<Term, NotValid> {
		return Effect.succeed(slugOf(text)).pipe(
			Effect.filterOrFail(
				(slug: string): boolean => slug.length > 0,
				(): NotValid => NotValid.create(),
			),
			Effect.map((slug: string): Term => new Term(slug)),
		);
	}

	foldedBy<Foreign>(contract: Folding<string, Foreign>): Foreign {
		return contract.encode(this.slug);
	}

	isSameAs(other: Term): boolean {
		return this.slug === other.slug;
	}
}

export { Term };
