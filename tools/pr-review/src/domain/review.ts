import { Effect, Match } from "effect";
import { z } from "zod";
import { HostError } from "../generated/domain/host-error.g.ts";
import { NoReview } from "../generated/domain/no-review.g.ts";
import { NotDue } from "../generated/domain/not-due.g.ts";
import type { NotStarted } from "../generated/domain/not-started.g.ts";
import { Posted } from "../generated/domain/posted.g.ts";
import { Probe } from "../generated/domain/probe.g.ts";
import type { Rule } from "../generated/domain/rule.g.ts";
import { TargetUrl } from "../generated/domain/target-url.g.ts";
import type { Agent } from "./agent.ts";
import { Assignment, type Entry } from "./assignment.ts";
import { type Post, PostShape } from "./post.ts";
import type { Poster } from "./posting.ts";

type Recorded = Entry | Post;

const ReviewShape = z.object({
	url: TargetUrl.codec,
	assigned: z
		.array(z.tuple([Probe.codec, Assignment.codec]).readonly())
		.readonly(),
	posts: z.array(PostShape).readonly(),
});

type ReviewParts = z.output<typeof ReviewShape>;
type Assigned = ReviewParts["assigned"][number];

interface ReviewStatus {
	readonly remaining: readonly Rule[];
	readonly posts: readonly Post[];
}

const isPost = (recorded: Recorded): recorded is Post =>
	recorded instanceof Posted || recorded instanceof HostError;
const isEntry = (recorded: Recorded): recorded is Entry => !isPost(recorded);
const isPosted = (post: Post): boolean => post instanceof Posted;

class Review {
	private readonly url: TargetUrl;
	private readonly assigned: readonly Assigned[];
	private readonly posts: readonly Post[];

	private constructor(
		url: TargetUrl,
		assigned: readonly Assigned[],
		posts: readonly Post[],
	) {
		this.url = url;
		this.assigned = assigned;
		this.posts = posts;
		Object.freeze(this);
	}

	static readonly codec = z.codec(
		ReviewShape,
		z.custom<Review>((value): boolean => value instanceof Review),
		{
			decode: ({ url, assigned, posts }: ReviewParts): Review =>
				new Review(url, assigned, posts),
			encode: ({ url, assigned, posts }: Review): ReviewParts => ({
				url,
				assigned,
				posts,
			}),
		},
	);

	static of(url: TargetUrl, assigned: readonly Assigned[]): Review {
		return new Review(url, assigned, []);
	}

	assignmentOf(probe: Probe): Effect.Effect<Assignment, NoReview> {
		return Effect.fromNullishOr(
			this.assigned.find(([owner]: Assigned): boolean => owner.isSameAs(probe)),
		).pipe(
			Effect.map(([, assignment]: Assigned): Assignment => assignment),
			Effect.mapError((): NoReview => NoReview.create()),
		);
	}

	after(probe: Probe, recorded: Recorded): Review {
		return Match.value(recorded).pipe(
			Match.when(
				isPost,
				(post: Post): Review =>
					new Review(this.url, this.assigned, [...this.posts, post]),
			),
			Match.when(
				isEntry,
				(entry: Entry): Review =>
					new Review(
						this.url,
						[
							...this.assigned.filter(
								([owner]: Assigned): boolean => !owner.isSameAs(probe),
							),
							...this.assigned
								.filter(([owner]: Assigned): boolean => owner.isSameAs(probe))
								.map(
									([owner, assignment]: Assigned): Assigned => [
										owner,
										assignment.after(entry),
									],
								),
						],
						this.posts,
					),
			),
			Match.exhaustive,
		);
	}

	status(): ReviewStatus {
		return {
			remaining: this.assigned.flatMap(
				([, assignment]: Assigned): readonly Rule[] =>
					assignment.ledger().remaining,
			),
			posts: this.posts,
		};
	}

	posting(poster: Poster): Effect.Effect<readonly Post[]> {
		return Effect.succeed(this.status()).pipe(
			Effect.filterOrFail(
				({ remaining, posts }: ReviewStatus): boolean =>
					remaining.length === 0 && !posts.some(isPosted),
				(): NotDue => NotDue.create(),
			),
			Effect.matchEffect({
				onFailure: (): Effect.Effect<readonly Post[]> => Effect.succeed([]),
				onSuccess: (): Effect.Effect<readonly Post[]> =>
					poster
						.post(this.url, {
							verdicts: this.assigned.flatMap(
								([, assignment]: Assigned) => assignment.ledger().verdicts,
							),
						})
						.pipe(
							Effect.match({
								onSuccess: (): readonly Post[] => [Posted.create()],
								onFailure: (hostError: HostError): readonly Post[] => [
									hostError,
								],
							}),
						),
			}),
		);
	}

	spawnedBy(agent: Agent): Effect.Effect<Review, NotStarted> {
		return Effect.forEach(
			this.assigned,
			([, assignment]: Assigned): Effect.Effect<Assignment, NotStarted> =>
				agent.spawn(assignment),
		).pipe(Effect.map((): Review => this));
	}

	dismissedBy(agent: Agent): Effect.Effect<Review> {
		return Effect.forEach(
			this.assigned.filter(
				([, assignment]: Assigned): boolean =>
					assignment.ledger().remaining.length === 0,
			),
			([, assignment]: Assigned): Effect.Effect<Assignment> =>
				agent.terminate(assignment),
		).pipe(Effect.map((): Review => this));
	}
}

export type { Recorded, ReviewStatus };
export { Review };
