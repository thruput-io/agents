import assert from "node:assert/strict";
import { test as it } from "node:test";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { pipe } from "fp-ts/lib/function.js";
import * as Task from "fp-ts/lib/Task.js";
import * as TaskEither from "fp-ts/lib/TaskEither.js";
import { errAsync, okAsync } from "neverthrow";
import type {
	Change,
	NotReviewable,
	Prepared,
	Probes,
	Review,
	TargetUrl,
	Workdir,
} from "./domain.ts";
import { prepareWithEffect } from "./with-effect.ts";
import { prepareWithFpTs } from "./with-fp-ts.ts";
import { prepareWithNeverthrow } from "./with-neverthrow.ts";

const opaque = <Marked>(): Marked => Object.freeze({}) as Marked;

const url = opaque<TargetUrl>();
const workdir = opaque<Workdir>();
const probes = opaque<Probes>();
const prepared = opaque<Prepared>();
const refused = opaque<NotReviewable>();

const review: Review = { prepared: () => prepared };
const change: Change = { ...opaque<Change>(), reviewWith: () => review };

type Saved = (readonly [Workdir, Review])[];

const foldedEffect = async (
	effect: Effect.Effect<Prepared, NotReviewable>,
): Promise<Prepared | NotReviewable> =>
	Result.match(await Effect.runPromise(Effect.result(effect)), {
		onFailure: (failure): Prepared | NotReviewable => failure,
		onSuccess: (success): Prepared | NotReviewable => success,
	});

it("effect: prepare saves the review of the change and returns it prepared", async () => {
	const saved: Saved = [];

	const answer = await foldedEffect(
		prepareWithEffect(
			{
				getChange: () => Effect.succeed(change),
				probes: () => Effect.succeed(probes),
				save: (under, given) =>
					Effect.promise(() => Promise.resolve(saved.push([under, given]))),
			},
			url,
			workdir,
		),
	);

	assert.equal(answer, prepared);
	assert.deepEqual(saved, [[workdir, review]]);
});

it("effect: prepare returns the typed failure and saves nothing", async () => {
	const saved: Saved = [];

	const answer = await foldedEffect(
		prepareWithEffect(
			{
				getChange: () => Effect.fail(refused),
				probes: () => Effect.succeed(probes),
				save: (under, given) =>
					Effect.promise(() => Promise.resolve(saved.push([under, given]))),
			},
			url,
			workdir,
		),
	);

	assert.equal(answer, refused);
	assert.deepEqual(saved, []);
});

const foldedTaskEither = (
	taskEither: TaskEither.TaskEither<NotReviewable, Prepared>,
): Promise<Prepared | NotReviewable> =>
	pipe(
		taskEither,
		TaskEither.matchW(
			(failure) => failure,
			(success) => success,
		),
	)();

it("fp-ts: prepare saves the review of the change and returns it prepared", async () => {
	const saved: Saved = [];

	const answer = await foldedTaskEither(
		prepareWithFpTs(
			{
				getChange: () => TaskEither.right(change),
				probes: () => Task.of(probes),
				save: (under, given) => () =>
					Promise.resolve(saved.push([under, given])).then(() => undefined),
			},
			url,
			workdir,
		),
	);

	assert.equal(answer, prepared);
	assert.deepEqual(saved, [[workdir, review]]);
});

it("fp-ts: prepare returns the typed failure and saves nothing", async () => {
	const saved: Saved = [];

	const answer = await foldedTaskEither(
		prepareWithFpTs(
			{
				getChange: () => TaskEither.left(refused),
				probes: () => Task.of(probes),
				save: (under, given) => () =>
					Promise.resolve(saved.push([under, given])).then(() => undefined),
			},
			url,
			workdir,
		),
	);

	assert.equal(answer, refused);
	assert.deepEqual(saved, []);
});

it("neverthrow: prepare saves the review of the change and returns it prepared", async () => {
	const saved: Saved = [];

	const answer = await prepareWithNeverthrow(
		{
			getChange: () => okAsync(change),
			probes: () => okAsync(probes),
			save: (under, given) =>
				okAsync(undefined).map(() => {
					saved.push([under, given]);
				}),
		},
		url,
		workdir,
	).match<Prepared | NotReviewable>(
		(success) => success,
		(failure) => failure,
	);

	assert.equal(answer, prepared);
	assert.deepEqual(saved, [[workdir, review]]);
});

it("neverthrow: prepare returns the typed failure and saves nothing", async () => {
	const saved: Saved = [];

	const answer = await prepareWithNeverthrow(
		{
			getChange: () => errAsync(refused),
			probes: () => okAsync(probes),
			save: (under, given) =>
				okAsync(undefined).map(() => {
					saved.push([under, given]);
				}),
		},
		url,
		workdir,
	).match<Prepared | NotReviewable>(
		(success) => success,
		(failure) => failure,
	);

	assert.equal(answer, refused);
	assert.deepEqual(saved, []);
});
