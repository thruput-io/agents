import { Effect, Match } from "effect";
import type { Probe } from "../domain/probe.ts";
import type { Rule } from "../domain/rule.ts";
import type { TargetUrl } from "../domain/target-url.ts";
import type { Agent } from "./agent.ts";
import type { Assignment, Entry } from "./assignment.ts";
import { HostError } from "./host-error.ts";
import { NoReview } from "./no-review.ts";
import { NotDue } from "./not-due.ts";
import type { NotStarted } from "./not-started.ts";
import type { Post } from "./post.ts";
import { Posted } from "./posted.ts";
import type { Poster } from "./posting.ts";

type Recorded = Entry | Post;

type Assigned = readonly [Probe, Assignment];

interface ReviewParts {
	readonly url: TargetUrl;
	readonly assigned: readonly Assigned[];
	readonly posts: readonly Post[];
}

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

	static from({ url, assigned, posts }: ReviewParts): Review {
		return new Review(url, assigned, posts);
	}

	static partsOf({ url, assigned, posts }: Review): ReviewParts {
		return { url, assigned, posts };
	}

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
