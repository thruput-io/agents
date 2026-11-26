import { z } from "zod";

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

	static readonly codec = z.codec(
		z.string().refine((text: string): boolean => slugOf(text).length > 0),
		z.custom<Term>((value): boolean => value instanceof Term),
		{
			decode: (text: string): Term => new Term(slugOf(text)),
			encode: (term: Term): string => term.slug,
		},
	);

	isSameAs(other: Term): boolean {
		return this.slug === other.slug;
	}
}

export { Term };
