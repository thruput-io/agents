import { Effect, Match } from "effect";
import type { Probe } from "../domain/probe.ts";
import type { Rule } from "../domain/rule.ts";
import type { TargetUrl } from "../domain/target-url.ts";
import type { Agent } from "./agent.ts";
import { Assignment, type Entry } from "./assignment.ts";
import { HostError } from "./host-error.ts";
import { NoReview } from "./no-review.ts";
import { NotDue } from "./not-due.ts";
import type { NotStarted } from "./not-started.ts";
import type { Page } from "./page.ts";
import type { Post } from "./post.ts";
import { Posted } from "./posted.ts";
import type { Poster } from "./posting.ts";
import type { Probes, Task } from "./task.ts";

type Recorded = Entry | Post;

type Assigned = readonly [Probe, Assignment];

interface Start {
	readonly url: TargetUrl;
	readonly pages: readonly Page[];
	readonly probes: Probes;
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
	private readonly start: Start;
	private readonly assigned: readonly Assigned[];
	private readonly posts: readonly Post[];

	private constructor(
		start: Start,
		assigned: readonly Assigned[],
		posts: readonly Post[],
	) {
		this.start = start;
		this.assigned = assigned;
		this.posts = posts;
		Object.freeze(this);
	}

	static of(url: TargetUrl, pages: readonly Page[], probes: Probes): Review {
		return new Review(
			{ url, pages, probes },
			probes.map(
				(task: Task): Assigned => [task.probe, Assignment.of(task, pages)],
			),
			[],
		);
	}

	started<Kept>(
		keep: (url: TargetUrl, pages: readonly Page[], probes: Probes) => Kept,
	): Kept {
		return keep(this.start.url, this.start.pages, this.start.probes);
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
					new Review(this.start, this.assigned, [...this.posts, post]),
			),
			Match.when(
				isEntry,
				(entry: Entry): Review =>
					new Review(
						this.start,
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
						.post(this.start.url, {
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
