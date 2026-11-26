import { Effect, Match } from "effect";
import { HostError } from "../generated/domain/host-error.g.ts";
import { NoReview } from "../generated/domain/no-review.g.ts";
import { NotDue } from "../generated/domain/not-due.g.ts";
import type { NotStarted } from "../generated/domain/not-started.g.ts";
import { Posted } from "../generated/domain/posted.g.ts";
import type { Probe } from "../generated/domain/probe.g.ts";
import type { Rule } from "../generated/domain/rule.g.ts";
import type { TargetUrl } from "../generated/domain/target-url.g.ts";
import type { Workdir } from "../generated/domain/workdir.g.ts";
import type { Agent } from "./agent.ts";
import type { Assignment, Entry } from "./assignment.ts";
import type { Poster } from "./posting.ts";

type Post = Posted | HostError;
type Recorded = Entry | Post;
type Assigned = readonly [Probe, Assignment];

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

interface ReviewStore {
	save: (workdir: Workdir, review: Review) => Effect.Effect<Review>;
	inWorkdir: (workdir: Workdir) => Effect.Effect<Review, NoReview>;
	ofProbe: (probe: Probe) => Effect.Effect<Assignment, NoReview>;
	append: (probe: Probe, recorded: Recorded) => Effect.Effect<Review, NoReview>;
}

export type { Post, Recorded, ReviewStatus, ReviewStore };
export { Review };
