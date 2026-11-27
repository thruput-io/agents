import type { Effect } from "effect";
import type { TargetUrl } from "../generated/domain/target-url.g.ts";
import type { HostError } from "./host-error.ts";
import type { Verdict } from "./verdict.ts";

interface Outcome {
	readonly verdicts: readonly Verdict[];
}

interface Poster {
	post: (url: TargetUrl, outcome: Outcome) => Effect.Effect<Outcome, HostError>;
}

export type { Poster };
