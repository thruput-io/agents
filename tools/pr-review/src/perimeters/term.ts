import { Effect } from "effect";
import { z } from "zod";
import { Term } from "../domain/term.ts";

const TermCodec = z.codec(
	z
		.string()
		.refine((text: string): boolean =>
			Effect.runSync(Effect.isSuccess(Term.of(text))),
		),
	z.custom<Term>((value): boolean => value instanceof Term),
	{
		decode: (text: string): Term => Effect.runSync(Term.of(text)),
		encode: (term: Term): string => Term.slugOf(term),
	},
);

export { TermCodec };
