import { Effect } from "effect";
import type { z } from "zod";
import { NotValid } from "../generated/domain/not-valid.g.ts";

interface Decoding<Value> {
	readonly parse: (text: string) => Value;
}

const notValid = (): NotValid => NotValid.create();

const parsedBy = <Shape>(
	shape: z.ZodType<Shape>,
	given: readonly string[],
): Effect.Effect<Shape, NotValid> =>
	Effect.try({ try: (): Shape => shape.parse(given), catch: notValid });

const decoded = <Value>(
	codec: Decoding<Value>,
	text: string,
): Effect.Effect<Value, NotValid> =>
	Effect.try({ try: (): Value => codec.parse(text), catch: notValid });

const namedBy = <Shape extends z.ZodObject>(
	shape: Shape,
	given: readonly string[],
): Effect.Effect<z.output<Shape>, NotValid> =>
	Effect.succeed(Object.keys(shape.shape)).pipe(
		Effect.filterOrFail(
			(names: readonly string[]): boolean => names.length === given.length,
			notValid,
		),
		Effect.flatMap(
			(names: readonly string[]): Effect.Effect<z.output<Shape>, NotValid> =>
				Effect.try({
					try: (): z.output<Shape> =>
						shape.parse(
							Object.fromEntries(
								names.map((name: string, place: number) => [
									name,
									given[place],
								]),
							),
						),
					catch: notValid,
				}),
		),
	);

export { decoded, namedBy, parsedBy };
