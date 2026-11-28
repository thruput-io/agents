import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { CreatedDir } from "../domain/created-dir.ts";
import { Session } from "../domain/session.ts";
import { Workdir } from "../domain/workdir.ts";
import { Session as SessionShape } from "../generated/domain/session.g.ts";
import { Workdir as WorkdirShape } from "../generated/domain/workdir.g.ts";
import { GitCheckout } from "../generated/perimeters/git-checkout.g.ts";
import {
	PrepareParams,
	StatusParams,
} from "../generated/perimeters/review-tool.g.ts";
import { StoredFolder } from "../generated/perimeters/stored-folder.g.ts";
import { StoredPlace } from "../generated/perimeters/stored-place.g.ts";
import { jsonOf } from "./json.ts";

const PrepareWorkdir = PrepareParams.pick({ workdir: true });
const PlaceText = jsonOf(StoredPlace);

type Prepared = z.output<typeof PrepareWorkdir>;
type Asked = z.output<typeof StatusParams>;

interface Dto<Params, Made> {
	readonly params: Params;
	readonly toDomain: () => Made;
}

const WorkdirOfPrepare = z.codec(PrepareWorkdir, WorkdirShape, {
	decode: ({ workdir }: Prepared): WorkdirShape => ({ path: workdir }),
	encode: ({ path }: WorkdirShape): Prepared => ({ workdir: path }),
});

const WorkdirOfFolder = z.codec(StoredFolder, WorkdirShape, {
	decode: ({ directory }: StoredFolder): WorkdirShape => ({ path: directory }),
	encode: ({ path }: WorkdirShape): StoredFolder => ({ directory: path }),
});

const SessionOfPlace = z.codec(StoredPlace, SessionShape, {
	decode: ({ session, directory }: StoredPlace): SessionShape => ({
		directory: { id: session, path: directory },
	}),
	encode: ({ directory }: SessionShape): StoredPlace => ({
		session: directory.id,
		directory: directory.path,
	}),
});

const SessionOfCheckout = z.codec(GitCheckout, SessionShape, {
	decode: ({ session, directory }: GitCheckout): SessionShape => ({
		directory: { id: session, path: directory },
	}),
	encode: ({ directory }: SessionShape): GitCheckout => ({
		session: directory.id,
		directory: directory.path,
	}),
});

const SessionOfAsked = z.codec(StatusParams, SessionShape, {
	decode: ({ session }: Asked): SessionShape =>
		SessionOfPlace.decode(
			PlaceText.decode(Buffer.from(session, "base64url").toString()),
		),
	encode: (shape: SessionShape): Asked => ({
		session: Buffer.from(
			PlaceText.encode(SessionOfPlace.encode(shape)),
		).toString("base64url"),
	}),
});

const createdAt = (place: StoredPlace): CreatedDir =>
	Reflect.construct(CreatedDir, [SessionOfPlace.decode(place).directory]);

const placeUnder = (workdir: Workdir): StoredPlace => {
	const session = randomUUID();
	const { directory } = WorkdirOfFolder.encode(WorkdirShape.parse(workdir));

	return { session, directory: join(directory, session) };
};

const prepareDto = (params: Prepared): Dto<Prepared, Workdir> => ({
	params,
	toDomain: (): Workdir =>
		Reflect.construct(Workdir, [WorkdirOfPrepare.decode(params)]),
});

const statusDto = (params: Asked): Dto<Asked, Session> => ({
	params,
	toDomain: (): Session =>
		Session.in(
			Reflect.construct(CreatedDir, [SessionOfAsked.decode(params).directory]),
		),
});

const askedOf = (session: Session): Asked =>
	SessionOfAsked.encode(SessionShape.parse(session));

const checkoutOf = (session: Session): GitCheckout =>
	SessionOfCheckout.encode(SessionShape.parse(session));

const placeOf = (session: Session): StoredPlace =>
	SessionOfPlace.encode(SessionShape.parse(session));

export {
	askedOf,
	checkoutOf,
	createdAt,
	placeOf,
	placeUnder,
	prepareDto,
	statusDto,
};
