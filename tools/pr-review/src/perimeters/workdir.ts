import { z } from "zod";
import { Workdir } from "../domain/workdir.ts";
import { Workdir as WorkdirShape } from "../generated/domain/workdir.g.ts";

const WorkdirCodec = z.codec(
	WorkdirShape,
	z.custom<Workdir>((value): boolean => value instanceof Workdir),
	{
		decode: (shape: WorkdirShape): Workdir => Workdir.of(shape),
		encode: (workdir: Workdir): WorkdirShape => Workdir.shapeOf(workdir),
	},
);

export { WorkdirCodec };
