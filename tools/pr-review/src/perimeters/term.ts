import { Effect } from "effect";
import { z } from "zod";
import { Term } from "../domain/term.ts";

const TermText = z
	.string()
	.refine((text: string): boolean =>
		Effect.runSync(Effect.isSuccess(Term.of(text))),
	);

const TermCodec = z.codec(
	TermText,
	z.custom<Term>((value): boolean => value instanceof Term),
	{
		decode: (text: string): Term => Effect.runSync(Term.of(text)),
		encode: (term: Term): string => term.foldedBy(TermText),
	},
);

export { TermCodec };
