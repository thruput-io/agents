import type { Effect } from "effect";
import type { Probe } from "../generated/domain/probe.g.ts";
import type { Workdir } from "../generated/domain/workdir.g.ts";
import type { Assignment } from "./assignment.ts";
import type { NoReview } from "./no-review.ts";
import type { Recorded, Review } from "./review.ts";
import type { WorkdirFailed } from "./workdir-failed.ts";

type NotRecorded = NoReview | WorkdirFailed;

interface ReviewStore {
	save: (
		workdir: Workdir,
		review: Review,
	) => Effect.Effect<Review, WorkdirFailed>;
	inWorkdir: (workdir: Workdir) => Effect.Effect<Review, NoReview>;
	ofProbe: (probe: Probe) => Effect.Effect<Assignment, NoReview>;
	append: (
		probe: Probe,
		recorded: Recorded,
	) => Effect.Effect<Review, NotRecorded>;
}

export type { NotRecorded, ReviewStore };
