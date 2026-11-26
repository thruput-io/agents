import type { Effect } from "effect";
import type { NoReview } from "../generated/domain/no-review.g.ts";
import type { Probe } from "../generated/domain/probe.g.ts";
import type { Workdir } from "../generated/domain/workdir.g.ts";
import type { Assignment } from "./assignment.ts";
import type { Recorded, Review } from "./review.ts";

interface ReviewStore {
	save: (workdir: Workdir, review: Review) => Effect.Effect<Review>;
	inWorkdir: (workdir: Workdir) => Effect.Effect<Review, NoReview>;
	ofProbe: (probe: Probe) => Effect.Effect<Assignment, NoReview>;
	append: (probe: Probe, recorded: Recorded) => Effect.Effect<Review, NoReview>;
}

export type { ReviewStore };
