import type { Effect } from "effect";
import type { Acknowledgement } from "../generated/domain/acknowledgement.g.ts";
import type { HostError } from "../generated/domain/host-error.g.ts";
import type { NoReview } from "../generated/domain/no-review.g.ts";
import type { Probe } from "../generated/domain/probe.g.ts";
import type { Verdict } from "../generated/domain/verdict.g.ts";
import type { Workdir } from "../generated/domain/workdir.g.ts";
import type { Assignment } from "./assignment.ts";
import type { CompleteReview } from "./complete-review.ts";
import type { PendingReview } from "./pending-review.ts";

type Review = PendingReview | CompleteReview;

type Entry = Acknowledgement | Verdict | HostError;

interface ReviewStore {
	save: (workdir: Workdir, review: Review) => Effect.Effect<Review>;
	inWorkdir: (workdir: Workdir) => Effect.Effect<Review, NoReview>;
	ofProbe: (probe: Probe) => Effect.Effect<Assignment, NoReview>;
	append: (probe: Probe, entry: Entry) => Effect.Effect<Review, NoReview>;
}

export type { Review, ReviewStore };
