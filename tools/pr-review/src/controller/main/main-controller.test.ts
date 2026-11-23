import assert from "node:assert/strict";
import { test as it } from "node:test";
import type { Either } from "../../domain/either.ts";
import type {
	Change,
	Instant,
	NotReviewable,
	Prepared,
	Probes,
	Refused,
	Resolution,
	Review,
	ReviewStatus,
	TargetUrl,
	Workdir,
} from "../../domain/review.ts";
import type { Hosts, Reviews } from "../../domain/review-ports.ts";
import { MainController } from "./main-controller.ts";

const opaque = <Marked>(): Marked => Object.freeze({}) as Marked;

const succeeded = <Success>(
	success: Success,
): Either<NotReviewable, Success> => ({
	mapAsync: async (onSuccess) => succeeded(await onSuccess(success)),
	fold: (_onFailure, onSuccess) => onSuccess(success),
});

const failed = <Success>(
	failure: NotReviewable,
): Either<NotReviewable, Success> => ({
	mapAsync: () => Promise.resolve(failed(failure)),
	fold: (onFailure) => onFailure(failure),
});

const settled = <Failure, Success>(
	either: Either<Failure, Success>,
): Failure | Success =>
	either.fold<Failure | Success>(
		(failure) => failure,
		(success) => success,
	);

const url = opaque<TargetUrl>();
const workdir = opaque<Workdir>();
const probes = opaque<Probes>();
const prepared = opaque<Prepared>();
const status = opaque<ReviewStatus>();
const instant = opaque<Instant>();
const refused = opaque<Refused>();

interface Seen {
	readonly resolved: TargetUrl[];
	readonly reviewedWith: Probes[];
	readonly saved: (readonly [Workdir, Review])[];
	readonly loaded: Workdir[];
	readonly askedAt: Instant[];
}

const reviewSeenBy = (seen: Seen): Review => ({
	prepared: () => prepared,
	statusAt: (at) => {
		seen.askedAt.push(at);
		return status;
	},
});

const changeSeenBy = (seen: Seen, review: Review): Change => ({
	...opaque<Change>(),
	reviewWith: (given) => {
		seen.reviewedWith.push(given);
		return review;
	},
});

const hostsSeenBy = (seen: Seen, resolution: Resolution): Hosts => ({
	getChange: (given) => {
		seen.resolved.push(given);
		return Promise.resolve(resolution);
	},
});

const reviewsSeenBy = (seen: Seen, review: Review): Reviews => ({
	save: (under, given) => {
		seen.saved.push([under, given]);
		return Promise.resolve();
	},
	load: (under) => {
		seen.loaded.push(under);
		return Promise.resolve(review);
	},
});

const stage = (resolve: (change: Change) => Resolution) => {
	const seen: Seen = {
		resolved: [],
		reviewedWith: [],
		saved: [],
		loaded: [],
		askedAt: [],
	};
	const review = reviewSeenBy(seen);
	const controller = MainController.over({
		hosts: hostsSeenBy(seen, resolve(changeSeenBy(seen, review))),
		reviews: reviewsSeenBy(seen, review),
		catalog: { probes: () => Promise.resolve(probes) },
		clock: { now: () => instant },
	});

	return { controller, seen, review };
};

it("prepare reviews the resolved change with the catalog's probes, saves the review, and returns it prepared", async () => {
	const { controller, seen, review } = stage(succeeded);

	const answer = await controller.prepare(url, workdir);

	assert.equal(settled(answer), prepared);
	assert.deepEqual(seen.resolved, [url]);
	assert.deepEqual(seen.reviewedWith, [probes]);
	assert.deepEqual(seen.saved, [[workdir, review]]);
});

it("prepare returns the failure it was given and starts no review", async () => {
	const { controller, seen } = stage(() => failed(refused));

	const answer = await controller.prepare(url, workdir);

	assert.equal(settled(answer), refused);
	assert.deepEqual(seen.reviewedWith, []);
	assert.deepEqual(seen.saved, []);
});

it("status reports the stored review as it stands at the clock's instant", async () => {
	const { controller, seen } = stage(succeeded);

	const answer = await controller.status(workdir);

	assert.equal(answer, status);
	assert.deepEqual(seen.loaded, [workdir]);
	assert.deepEqual(seen.askedAt, [instant]);
});
