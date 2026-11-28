import { z } from "zod";

const jsonOf = <Shape extends z.ZodType>(
	shape: Shape,
): z.ZodCodec<z.ZodString, Shape> =>
	z.codec(z.string(), shape, {
		decode: (text: string): z.input<Shape> => JSON.parse(text),
		encode: (value: z.input<Shape>): string => JSON.stringify(value),
	});

export { jsonOf };
