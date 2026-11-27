import { Match } from "effect";
import { z } from "zod";
import { Acknowledgement } from "../domain/acknowledgement.ts";
import { Back } from "../domain/back.ts";
import { Forward } from "../domain/forward.ts";
import { HostError } from "../domain/host-error.ts";
import type { Post } from "../domain/post.ts";
import { Posted } from "../domain/posted.ts";
import { Review, type ReviewParts } from "../domain/review.ts";
import { Verdict } from "../domain/verdict.ts";
import { AssignmentCodec, VerdictCodec } from "./stored-assignment.ts";
import { AcknowledgementCodec, ProbeCodec, TargetUrlCodec } from "./values.ts";

interface Sent {
	readonly acknowledgement: Acknowledgement;
}

interface Judged {
	readonly verdict: Verdict;
}

const POSTS = {
	posted: (): Post => Posted.create(),
	"host-error": (): Post => HostError.create(),
};

const PostShape = z.codec(
	z.enum(["posted", "host-error"]),
	z.custom<Post>(
		(value): boolean => value instanceof Posted || value instanceof HostError,
	),
	{
		decode: (name: keyof typeof POSTS): Post => POSTS[name](),
		encode: (post: Post): keyof typeof POSTS =>
			Match.value(post).pipe(
				Match.when(
					(given: Post): given is Posted => given instanceof Posted,
					(): keyof typeof POSTS => "posted",
				),
				Match.when(
					(given: Post): given is HostError => given instanceof HostError,
					(): keyof typeof POSTS => "host-error",
				),
				Match.exhaustive,
			),
	},
);

const ReviewCodec = z.codec(
	z.object({
		url: TargetUrlCodec,
		assigned: z
			.array(z.tuple([ProbeCodec, AssignmentCodec]).readonly())
			.readonly(),
		posts: z.array(PostShape).readonly(),
	}),
	z.custom<Review>((value): boolean => value instanceof Review),
	{
		decode: (parts: ReviewParts): Review => Review.from(parts),
		encode: (review: Review): ReviewParts => Review.partsOf(review),
	},
);

const SentShape = z.codec(
	z.object({ acknowledgement: AcknowledgementCodec }),
	z.custom<Acknowledgement>(
		(value): boolean => value instanceof Acknowledgement,
	),
	{
		decode: ({ acknowledgement }: Sent): Acknowledgement => acknowledgement,
		encode: (acknowledgement: Acknowledgement): Sent => ({ acknowledgement }),
	},
);

const JudgedShape = z.codec(
	z.object({ verdict: VerdictCodec }),
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
	probe: ProbeCodec,
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
export { RecordingShape, ReviewCodec };
