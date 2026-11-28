import type { Effect } from "effect";
import type { Probe } from "../domain/probe.ts";
import type { Session } from "../domain/session.ts";
import type { Assignment } from "./assignment.ts";
import type { CreatedDir } from "./created-dir.ts";
import type { NoReview } from "./no-review.ts";
import type { Recorded, Review } from "./review.ts";
import type { Workdir } from "./workdir.ts";
import type { WorkdirFailed } from "./workdir-failed.ts";

type NotRecorded = NoReview | WorkdirFailed;

interface ReviewStore {
	created: (workdir: Workdir) => Effect.Effect<CreatedDir, WorkdirFailed>;
	save: (
		workdir: Session,
		review: Review,
	) => Effect.Effect<Review, WorkdirFailed>;
	inWorkdir: (workdir: Session) => Effect.Effect<Review, NoReview>;
	ofProbe: (probe: Probe) => Effect.Effect<Assignment, NoReview>;
	append: (
		probe: Probe,
		recorded: Recorded,
	) => Effect.Effect<Review, NotRecorded>;
}

export type { NotRecorded, ReviewStore };
