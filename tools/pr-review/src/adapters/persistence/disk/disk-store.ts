import { Effect } from "effect";
import type { Assignment } from "../../../domain/assignment.ts";
import type { NoReview } from "../../../domain/no-review.ts";
import type { Recorded, Review } from "../../../domain/review.ts";
import type { NotRecorded, ReviewStore } from "../../../domain/review-store.ts";
import type { Workdir } from "../../../domain/workdir.ts";
import type { WorkdirFailed } from "../../../domain/workdir-failed.ts";
import type { Probe } from "../../../generated/domain/probe.g.ts";
import {
	fileIn,
	fileOf,
	nothingStored,
	notWritable,
	reviewOfText,
	writtenRecording,
	writtenReview,
} from "../../../perimeters/disk.ts";

interface Files {
	read: (path: string) => Promise<string>;
	write: (path: string, text: string) => Promise<void>;
	append: (path: string, text: string) => Promise<void>;
}

const readingOver =
	(files: Files) =>
	(path: string): Effect.Effect<Review, NoReview> =>
		Effect.tryPromise({
			try: (): Promise<string> => files.read(path),
			catch: (): NoReview => nothingStored(),
		}).pipe(Effect.map(reviewOfText));

const savingOver =
	(files: Files) =>
	(workdir: Workdir, review: Review): Effect.Effect<Review, WorkdirFailed> =>
		Effect.tryPromise({
			try: (): Promise<void> =>
				files.write(fileIn(workdir), writtenReview(review)),
			catch: (): WorkdirFailed => notWritable(),
		}).pipe(Effect.map((): Review => review));

const appendingOver =
	(files: Files) =>
	(probe: Probe, recorded: Recorded): Effect.Effect<void, WorkdirFailed> =>
		Effect.tryPromise({
			try: (): Promise<void> =>
				files.append(fileOf(probe), writtenRecording(probe, recorded)),
			catch: (): WorkdirFailed => notWritable(),
		});

const diskStoreOver = (files: Files): ReviewStore => {
	const read = readingOver(files);
	const appended = appendingOver(files);

	const assignmentIn = (probe: Probe): Effect.Effect<Assignment, NoReview> =>
		read(fileOf(probe)).pipe(
			Effect.flatMap(
				(review: Review): Effect.Effect<Assignment, NoReview> =>
					review.assignmentOf(probe),
			),
		);

	return {
		save: savingOver(files),
		inWorkdir: (workdir: Workdir): Effect.Effect<Review, NoReview> =>
			read(fileIn(workdir)),
		ofProbe: assignmentIn,
		append: (
			probe: Probe,
			recorded: Recorded,
		): Effect.Effect<Review, NotRecorded> =>
			assignmentIn(probe).pipe(
				Effect.flatMap(
					(): Effect.Effect<void, WorkdirFailed> => appended(probe, recorded),
				),
				Effect.flatMap(
					(): Effect.Effect<Review, NoReview> => read(fileOf(probe)),
				),
			),
	};
};

export type { Files };
export { diskStoreOver };
