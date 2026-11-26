import { z } from "zod";
import { textOf } from "../domain/text.ts";
import {
	reviewStatusFrom,
	targetUrlFrom,
	workdirFrom,
} from "../generated/domain/factory.g.ts";
import {
	ReviewStatusSchema,
	TargetUrlSchema,
	WorkdirSchema,
} from "../generated/domain/schema.g.ts";
import type {
	ReviewStatus,
	TargetUrl,
	Workdir,
} from "../generated/domain/value.g.ts";

const TargetUrlCodec = z.codec(TargetUrlSchema, z.custom<TargetUrl>(), {
	decode: (text) => targetUrlFrom(text),
	encode: (url) => textOf(url),
});

const WorkdirCodec = z.codec(WorkdirSchema, z.custom<Workdir>(), {
	decode: (text) => workdirFrom(text),
	encode: (workdir) => textOf(workdir),
});

const ReviewStatusCodec = z.codec(
	ReviewStatusSchema,
	z.custom<ReviewStatus>(),
	{
		decode: () => reviewStatusFrom(),
		encode: () => ({}),
	},
);

export { ReviewStatusCodec, TargetUrlCodec, WorkdirCodec };
