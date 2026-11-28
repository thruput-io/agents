import { Effect } from "effect";
import type { Assignment } from "../../../domain/assignment.ts";
import type { CreatedDir } from "../../../domain/created-dir.ts";
import type { NoReview } from "../../../domain/no-review.ts";
import type { Probe } from "../../../domain/probe.ts";
import type { Recorded, Review } from "../../../domain/review.ts";
import type { NotRecorded, ReviewStore } from "../../../domain/review-store.ts";
import type { Session } from "../../../domain/session.ts";
import type { Workdir } from "../../../domain/workdir.ts";
import type { WorkdirFailed } from "../../../domain/workdir-failed.ts";
import type { StoredPlace } from "../../../generated/perimeters/stored-place.g.ts";
import {
	fileIn,
	fileOf,
	nothingStored,
	notWritable,
	reviewOfText,
	writtenRecording,
	writtenReview,
} from "../../../perimeters/disk.ts";
import { createdAt, placeUnder } from "../../../perimeters/session.ts";

interface Files {
	make: (path: string) => Promise<void>;
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
	(workdir: Session, review: Review): Effect.Effect<Review, WorkdirFailed> =>
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

const creatingOver =
	(files: Files) =>
	(workdir: Workdir): Effect.Effect<CreatedDir, WorkdirFailed> =>
		Effect.succeed(placeUnder(workdir)).pipe(
			Effect.flatMap(
				(place: StoredPlace): Effect.Effect<CreatedDir, WorkdirFailed> =>
					Effect.tryPromise({
						try: (): Promise<void> => files.make(place.directory),
						catch: (): WorkdirFailed => notWritable(),
					}).pipe(Effect.map((): CreatedDir => createdAt(place))),
			),
		);

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
		created: creatingOver(files),
		save: savingOver(files),
		inWorkdir: (workdir: Session): Effect.Effect<Review, NoReview> =>
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
