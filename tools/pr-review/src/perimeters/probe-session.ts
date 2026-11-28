import { Buffer } from "node:buffer";
import type { Probe } from "../domain/probe.ts";
import type { Session } from "../domain/session.ts";
import { StoredProbe } from "../generated/perimeters/stored-probe.g.ts";
import { jsonOf } from "./json.ts";
import { placeOf } from "./session.ts";
import { ProbeCodec } from "./values.ts";

const ProbeText = jsonOf(StoredProbe);

const heldBy = (probe: Probe): StoredProbe =>
	ProbeText.decode(
		Buffer.from(ProbeCodec.encode(probe), "base64url").toString(),
	);

const probeIn = (session: Session, name: string): Probe =>
	ProbeCodec.decode(
		Buffer.from(ProbeText.encode({ name, place: placeOf(session) })).toString(
			"base64url",
		),
	);

export { heldBy, probeIn };
