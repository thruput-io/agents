import { z } from "zod";
import { Workdir } from "../domain/workdir.ts";
import { Workdir as WorkdirShape } from "../generated/domain/workdir.g.ts";
import { WorkdirPath } from "../generated/domain/workdir-path.g.ts";

const WorkdirOfPath = z.codec(WorkdirPath, WorkdirShape, {
	decode: (path: WorkdirPath): WorkdirShape => ({ path }),
	encode: ({ path }: WorkdirShape): WorkdirPath => path,
});

const workdirOf = (path: WorkdirPath): Workdir =>
	Reflect.construct(Workdir, [WorkdirOfPath.decode(path)]);

const pathOf = (workdir: Workdir): WorkdirPath =>
	WorkdirOfPath.encode(WorkdirShape.parse(workdir));

export { pathOf, workdirOf };
