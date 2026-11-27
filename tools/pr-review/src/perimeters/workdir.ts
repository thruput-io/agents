import { z } from "zod";
import { Workdir } from "../domain/workdir.ts";
import { Workdir as WorkdirShape } from "../generated/domain/workdir.g.ts";
import { StatusParams } from "../generated/perimeters/review-tool.g.ts";

type Status = z.output<typeof StatusParams>;

const WorkdirOfStatus = z.codec(StatusParams, WorkdirShape, {
	decode: ({ workdir }: Status): WorkdirShape => ({ path: workdir }),
	encode: ({ path }: WorkdirShape): Status => ({ workdir: path }),
});

const workdirIn = (params: Status): Workdir =>
	Reflect.construct(Workdir, [WorkdirOfStatus.decode(params)]);

const paramsOf = (workdir: Workdir): Status =>
	WorkdirOfStatus.encode(WorkdirShape.parse(workdir));

export { paramsOf, workdirIn };
