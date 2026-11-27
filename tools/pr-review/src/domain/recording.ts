import { z } from "zod";
import { Acknowledgement } from "../generated/domain/acknowledgement.g.ts";
import { Probe } from "../generated/domain/probe.g.ts";
import { Back } from "./back.ts";
import { Forward } from "./forward.ts";
import { PostShape } from "./post.ts";
import { Verdict } from "./verdict.ts";

interface Sent {
	readonly acknowledgement: Acknowledgement;
}

interface Judged {
	readonly verdict: Verdict;
}

const SentShape = z.codec(
	z.object({ acknowledgement: Acknowledgement.codec }),
	z.custom<Acknowledgement>(
		(value): boolean => value instanceof Acknowledgement,
	),
	{
		decode: ({ acknowledgement }: Sent): Acknowledgement => acknowledgement,
		encode: (acknowledgement: Acknowledgement): Sent => ({ acknowledgement }),
	},
);

const JudgedShape = z.codec(
	z.object({ verdict: Verdict.codec }),
	z.custom<Verdict>((value): boolean => value instanceof Verdict),
	{
		decode: ({ verdict }: Judged): Verdict => verdict,
		encode: (verdict: Verdict): Judged => ({ verdict }),
	},
);

const ForwardShape = z.codec(
	z.literal("forward"),
	z.custom<Forward>((value): boolean => value instanceof Forward),
	{
		decode: (): Forward => Forward.create(),
		encode: (): "forward" => "forward",
	},
);

const BackShape = z.codec(
	z.literal("back"),
	z.custom<Back>((value): boolean => value instanceof Back),
	{
		decode: (): Back => Back.create(),
		encode: (): "back" => "back",
	},
);

const RecordingShape = z.object({
	probe: Probe.codec,
	recorded: z.union([
		SentShape,
		JudgedShape,
		ForwardShape,
		BackShape,
		PostShape,
	]),
});

type Recording = z.output<typeof RecordingShape>;

export type { Recording };
export { RecordingShape };
