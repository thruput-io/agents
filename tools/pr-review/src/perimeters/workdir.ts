import { Buffer } from "node:buffer";
import { z } from "zod";
import { Workdir } from "../domain/workdir.ts";
import { Workdir as WorkdirShape } from "../generated/domain/workdir.g.ts";
import { GitCheckout } from "../generated/perimeters/git-checkout.g.ts";
import {
	PrepareParams,
	StatusParams,
} from "../generated/perimeters/review-tool.g.ts";
import { StoredPlace } from "../generated/perimeters/stored-place.g.ts";

const PrepareWorkdir = PrepareParams.pick({ workdir: true });

type Prepared = z.output<typeof PrepareWorkdir>;
type Session = z.output<typeof StatusParams>;

interface Dto<Params> {
	readonly params: Params;
	readonly toDomain: () => Workdir;
}

const WorkdirOfPrepare = z.codec(PrepareWorkdir, WorkdirShape, {
	decode: ({ workdir }: Prepared): WorkdirShape => ({ path: workdir }),
	encode: ({ path }: WorkdirShape): Prepared => ({ workdir: path }),
});

const WorkdirOfSession = z.codec(StatusParams, WorkdirShape, {
	decode: ({ session }: Session): WorkdirShape => ({
		path: Buffer.from(session, "base64url").toString(),
	}),
	encode: ({ path }: WorkdirShape): Session => ({
		session: Buffer.from(path).toString("base64url"),
	}),
});

const WorkdirOfCheckout = z.codec(GitCheckout, WorkdirShape, {
	decode: ({ directory }: GitCheckout): WorkdirShape => ({ path: directory }),
	encode: ({ path }: WorkdirShape): GitCheckout => ({ directory: path }),
});

const WorkdirOfPlace = z.codec(StoredPlace, WorkdirShape, {
	decode: ({ directory }: StoredPlace): WorkdirShape => ({ path: directory }),
	encode: ({ path }: WorkdirShape): StoredPlace => ({ directory: path }),
});

const prepareDto = (params: Prepared): Dto<Prepared> => ({
	params,
	toDomain: (): Workdir =>
		Reflect.construct(Workdir, [WorkdirOfPrepare.decode(params)]),
});

const statusDto = (params: Session): Dto<Session> => ({
	params,
	toDomain: (): Workdir =>
		Reflect.construct(Workdir, [WorkdirOfSession.decode(params)]),
});

const sessionOf = (workdir: Workdir): Session =>
	WorkdirOfSession.encode(WorkdirShape.parse(workdir));

const checkoutOf = (workdir: Workdir): GitCheckout =>
	WorkdirOfCheckout.encode(WorkdirShape.parse(workdir));

const placeOf = (workdir: Workdir): StoredPlace =>
	WorkdirOfPlace.encode(WorkdirShape.parse(workdir));

export { checkoutOf, placeOf, prepareDto, sessionOf, statusDto };
