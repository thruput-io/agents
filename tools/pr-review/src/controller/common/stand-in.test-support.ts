import { Effect } from "effect";
import type { Agent } from "../../domain/agent.ts";
import type { Assignment } from "../../domain/assignment.ts";
import { Change } from "../../domain/change.ts";
import type { Host, NotReviewable } from "../../domain/host.ts";
import type { Poster } from "../../domain/posting.ts";
import type { Recorded, Review } from "../../domain/review.ts";
import type { ReviewStore } from "../../domain/review-store.ts";
import {
	pageSample,
	probeSample,
	ruleSample,
	taskSample,
	urlSample,
} from "../../domain/sample.test-support.ts";
import { Acknowledgement } from "../../generated/domain/acknowledgement.g.ts";
import type { HostError } from "../../generated/domain/host-error.g.ts";
import { NoReview } from "../../generated/domain/no-review.g.ts";
import type { Probe } from "../../generated/domain/probe.g.ts";
import type { Rule } from "../../generated/domain/rule.g.ts";
import type { TargetUrl } from "../../generated/domain/target-url.g.ts";
import { Workdir } from "../../generated/domain/workdir.g.ts";

type Outcome = Parameters<Poster["post"]>[1];

const probe: Probe = probeSample("probe-1");
const purpose: Rule = ruleSample("Stated purpose");
const unused: Rule = ruleSample("Delete unused");
const sent: Acknowledgement = Acknowledgement.codec.decode(
	"By sending this ack I acknowledge that I have read all instructions, and implicitly that I know how to use the review tool.",
);
const change: Change = Change.of(urlSample(), [pageSample()]);

const host: Host = {
	getChange: (): Effect.Effect<Change, NotReviewable> => Effect.succeed(change),
	post: (_to: TargetUrl, outcome: Outcome): Effect.Effect<Outcome, HostError> =>
		Effect.succeed(outcome),
};

const agent: Agent = {
	spawn: (assignment: Assignment): Effect.Effect<Assignment> =>
		Effect.succeed(assignment),
	terminate: (assignment: Assignment): Effect.Effect<Assignment> =>
		Effect.succeed(assignment),
};

const emptyStore = (): ReviewStore => {
	const kept: Review[] = [];
	const latest = (): Effect.Effect<Review, NoReview> =>
		Effect.fromNullishOr(kept.at(-1)).pipe(
			Effect.mapError((): NoReview => NoReview.create()),
		);
	const keeping = (review: Review): Effect.Effect<Review> =>
		Effect.sync((): Review => {
			kept.push(review);

			return review;
		});

	return {
		save: (_workdir: Workdir, review: Review): Effect.Effect<Review> =>
			keeping(review),
		inWorkdir: latest,
		ofProbe: (holder: Probe): Effect.Effect<Assignment, NoReview> =>
			latest().pipe(
				Effect.flatMap(
					(review: Review): Effect.Effect<Assignment, NoReview> =>
						review.assignmentOf(holder),
				),
			),
		append: (
			holder: Probe,
			recorded: Recorded,
		): Effect.Effect<Review, NoReview> =>
			latest().pipe(
				Effect.flatMap(
					(review: Review): Effect.Effect<Review> =>
						keeping(review.after(holder, recorded)),
				),
			),
	};
};

const storeWithReview = (): ReviewStore => {
	const store: ReviewStore = emptyStore();

	Effect.runSync(
		store.save(
			Workdir.codec.decode("/work"),
			change.review([taskSample(probe, [purpose, unused])]),
		),
	);

	return store;
};

export {
	agent,
	emptyStore,
	host,
	probe,
	purpose,
	sent,
	storeWithReview,
	unused,
};
