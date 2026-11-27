import { Match } from "effect";
import { z } from "zod";
import { Acknowledgement } from "../domain/acknowledgement.ts";
import type { Assignment } from "../domain/assignment.ts";
import { Back } from "../domain/back.ts";
import { Forward } from "../domain/forward.ts";
import { HostError } from "../domain/host-error.ts";
import type { Post } from "../domain/post.ts";
import { Posted } from "../domain/posted.ts";
import { Probe } from "../domain/probe.ts";
import { type Recorded, Review } from "../domain/review.ts";
import { TargetUrl } from "../domain/target-url.ts";
import { Verdict } from "../domain/verdict.ts";
import type { StoredAssigned } from "../generated/perimeters/stored-assigned.g.ts";
import type { StoredPost } from "../generated/perimeters/stored-post.g.ts";
import { StoredRecording } from "../generated/perimeters/stored-recording.g.ts";
import { StoredReview } from "../generated/perimeters/stored-review.g.ts";
import {
	assignmentFrom,
	storedAssignment,
	storedVerdict,
	verdictFrom,
} from "./stored-assignment.ts";

type StoredRecorded = StoredRecording["recorded"];

interface Recording {
	readonly probe: Probe;
	readonly recorded: Recorded;
}

const isPosted = (given: Recorded): given is Posted => given instanceof Posted;
const isHostError = (given: Recorded): given is HostError =>
	given instanceof HostError;
const isForward = (given: Recorded): given is Forward =>
	given instanceof Forward;
const isBack = (given: Recorded): given is Back => given instanceof Back;
const isVerdict = (given: Recorded): given is Verdict =>
	given instanceof Verdict;
const isAcknowledgement = (given: Recorded): given is Acknowledgement =>
	given instanceof Acknowledgement;

const POSTS = {
	posted: (): Post => Posted.create(),
	"host-error": (): Post => HostError.create(),
};

const postFrom = (stored: StoredPost): Post => POSTS[stored]();

const recordedFrom = (stored: StoredRecorded): Recorded =>
	Match.value(stored).pipe(
		Match.when("forward", (): Recorded => Forward.create()),
		Match.when("back", (): Recorded => Back.create()),
		Match.when("posted", (): Recorded => Posted.create()),
		Match.when("host-error", (): Recorded => HostError.create()),
		Match.when(
			{ acknowledgement: Match.string },
			({ acknowledgement }): Recorded => Acknowledgement.of(acknowledgement),
		),
		Match.when(
			{ verdict: Match.defined },
			({ verdict }): Recorded => verdictFrom(verdict),
		),
		Match.exhaustive,
	);

const storedRecorded = (recorded: Recorded): StoredRecorded =>
	Match.value(recorded).pipe(
		Match.when(isForward, (): StoredRecorded => "forward"),
		Match.when(isBack, (): StoredRecorded => "back"),
		Match.when(isPosted, (): StoredRecorded => "posted"),
		Match.when(isHostError, (): StoredRecorded => "host-error"),
		Match.when(
			isAcknowledgement,
			(sent: Acknowledgement): StoredRecorded => ({
				acknowledgement: Acknowledgement.shapeOf(sent),
			}),
		),
		Match.when(
			isVerdict,
			(verdict: Verdict): StoredRecorded => ({
				verdict: storedVerdict(verdict),
			}),
		),
		Match.exhaustive,
	);

const storedPost = (post: Post): StoredPost =>
	Match.value(post).pipe(
		Match.when(isPosted, (): StoredPost => "posted"),
		Match.when(isHostError, (): StoredPost => "host-error"),
		Match.exhaustive,
	);

const ReviewCodec = z.codec(
	StoredReview,
	z.custom<Review>((value): boolean => value instanceof Review),
	{
		decode: (stored: StoredReview): Review =>
			Review.from({
				url: TargetUrl.of(stored.url),
				assigned: stored.assigned.map(
					({ probe, assignment }: StoredAssigned) =>
						[Probe.of(probe), assignmentFrom(assignment)] as const,
				),
				posts: stored.posts.map(postFrom),
			}),
		encode: (review: Review): StoredReview => {
			const { url, assigned, posts } = Review.partsOf(review);

			return {
				url: TargetUrl.shapeOf(url),
				assigned: assigned.map(
					([probe, assignment]: readonly [
						Probe,
						Assignment,
					]): StoredAssigned => ({
						probe: Probe.shapeOf(probe),
						assignment: storedAssignment(assignment),
					}),
				),
				posts: posts.map(storedPost),
			};
		},
	},
);

const RecordingCodec = z.codec(StoredRecording, z.custom<Recording>(), {
	decode: ({ probe, recorded }: StoredRecording): Recording => ({
		probe: Probe.of(probe),
		recorded: recordedFrom(recorded),
	}),
	encode: ({ probe, recorded }: Recording): StoredRecording => ({
		probe: Probe.shapeOf(probe),
		recorded: storedRecorded(recorded),
	}),
});

export type { Recording };
export { RecordingCodec, ReviewCodec };
