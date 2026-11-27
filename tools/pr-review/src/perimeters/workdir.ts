import { z } from "zod";
import { Workdir } from "../domain/workdir.ts";
import { Workdir as WorkdirShape } from "../generated/domain/workdir.g.ts";
import { GitCheckout } from "../generated/perimeters/git-checkout.g.ts";
import { StatusParams } from "../generated/perimeters/review-tool.g.ts";

type Status = z.output<typeof StatusParams>;

interface StatusDto extends Status {
	readonly toDomain: () => Workdir;
}

const WorkdirOfStatus = z.codec(StatusParams, WorkdirShape, {
	decode: ({ workdir }: Status): WorkdirShape => ({ path: workdir }),
	encode: ({ path }: WorkdirShape): Status => ({ workdir: path }),
});

const WorkdirOfCheckout = z.codec(GitCheckout, WorkdirShape, {
	decode: ({ directory }: GitCheckout): WorkdirShape => ({ path: directory }),
	encode: ({ path }: WorkdirShape): GitCheckout => ({ directory: path }),
});

const statusDto = (params: Status): StatusDto => ({
	...params,
	toDomain: (): Workdir =>
		Reflect.construct(Workdir, [WorkdirOfStatus.decode(params)]),
});

const paramsOf = (workdir: Workdir): Status =>
	WorkdirOfStatus.encode(WorkdirShape.parse(workdir));

const checkoutOf = (workdir: Workdir): GitCheckout =>
	WorkdirOfCheckout.encode(WorkdirShape.parse(workdir));

export { checkoutOf, paramsOf, statusDto };
