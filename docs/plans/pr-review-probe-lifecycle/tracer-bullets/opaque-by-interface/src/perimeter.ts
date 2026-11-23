import { z } from "zod";
import type { Change, Probe } from "./domain.ts";
import { ChangeDataSchema, ProbeDataSchema } from "./generated.ts";
import {
	changeFrom,
	dataOfChange,
	dataOfProbe,
	isMinted,
	probeFrom,
} from "./internal.ts";

const ChangeCodec = z.codec(ChangeDataSchema, z.custom<Change>(isMinted), {
	decode: (data) => changeFrom(data),
	encode: (change) => {
		const { author, description } = dataOfChange(change);

		return { author, description };
	},
});

const ProbeCodec = z.codec(ProbeDataSchema, z.custom<Probe>(isMinted), {
	decode: (data) => probeFrom(data),
	encode: (probe) => {
		const { name, group } = dataOfProbe(probe);

		return { name, group };
	},
});

export { ChangeCodec, ProbeCodec };
