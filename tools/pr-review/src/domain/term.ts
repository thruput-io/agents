import { Effect } from "effect";
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

	static slugOf(term: Term): string {
		return term.slug;
	}

	isSameAs(other: Term): boolean {
		return this.slug === other.slug;
	}
}

export { Term };
