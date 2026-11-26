import type { Effect } from "effect";
import type { NoReview } from "../generated/domain/no-review.g.ts";
import type { Probe } from "../generated/domain/probe.g.ts";
import type { Workdir } from "../generated/domain/workdir.g.ts";
import type { WorkdirFailed } from "../generated/domain/workdir-failed.g.ts";
import type { Assignment } from "./assignment.ts";
import type { Recorded, Review } from "./review.ts";

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
