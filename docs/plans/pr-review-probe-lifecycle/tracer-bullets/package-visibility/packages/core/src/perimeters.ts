import { z } from "zod";
import type { Assignment, Change, Probe } from "./domain.ts";
import {
	AssignmentDataSchema,
	ChangeDataSchema,
	ProbeDataSchema,
} from "./generated.ts";
import {
	assignmentFrom,
	changeFrom,
	dataOfAssignment,
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

const AssignmentCodec = z.codec(
	AssignmentDataSchema,
	z.custom<Assignment>(isMinted),
	{
		decode: (data) => assignmentFrom(data),
		encode: (assignment) => {
			const { author, probe, group } = dataOfAssignment(assignment);

			return { author, probe, group };
		},
	},
);

export { AssignmentCodec, ChangeCodec, ProbeCodec };
