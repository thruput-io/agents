import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { z } from "zod";
import { Session } from "../domain/session.ts";
import { Session as SessionShape } from "../generated/domain/session.g.ts";
import { GitCheckout } from "../generated/perimeters/git-checkout.g.ts";
import {
	PrepareParams,
	StatusParams,
} from "../generated/perimeters/review-tool.g.ts";
import { StoredPlace } from "../generated/perimeters/stored-place.g.ts";
import { jsonOf } from "./json.ts";

const PrepareWorkdir = PrepareParams.pick({ workdir: true });
const PlaceText = jsonOf(StoredPlace);

type Prepared = z.output<typeof PrepareWorkdir>;
type Asked = z.output<typeof StatusParams>;

interface Dto<Params> {
	readonly params: Params;
	readonly toDomain: () => Session;
}

const started = (workdir: string, id: string): SessionShape => ({
	id,
	directory: join(workdir, id),
});

const SessionOfPrepare = z.codec(PrepareWorkdir, SessionShape, {
	decode: ({ workdir }: Prepared): SessionShape =>
		started(workdir, randomUUID()),
	encode: ({ directory }: SessionShape): Prepared => ({
		workdir: dirname(directory),
	}),
});

const SessionOfPlace = z.codec(StoredPlace, SessionShape, {
	decode: ({ session, directory }: StoredPlace): SessionShape => ({
		id: session,
		directory,
	}),
	encode: ({ id, directory }: SessionShape): StoredPlace => ({
		session: id,
		directory,
	}),
});

const SessionOfCheckout = z.codec(GitCheckout, SessionShape, {
	decode: ({ session, directory }: GitCheckout): SessionShape => ({
		id: session,
		directory,
	}),
	encode: ({ id, directory }: SessionShape): GitCheckout => ({
		session: id,
		directory,
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

const prepareDto = (params: Prepared): Dto<Prepared> => ({
	params,
	toDomain: (): Session =>
		Reflect.construct(Session, [SessionOfPrepare.decode(params)]),
});

const statusDto = (params: Asked): Dto<Asked> => ({
	params,
	toDomain: (): Session =>
		Reflect.construct(Session, [SessionOfAsked.decode(params)]),
});

const askedOf = (session: Session): Asked =>
	SessionOfAsked.encode(SessionShape.parse(session));

const checkoutOf = (session: Session): GitCheckout =>
	SessionOfCheckout.encode(SessionShape.parse(session));

const placeOf = (session: Session): StoredPlace =>
	SessionOfPlace.encode(SessionShape.parse(session));

export { askedOf, checkoutOf, placeOf, prepareDto, statusDto };
