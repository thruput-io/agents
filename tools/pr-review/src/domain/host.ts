import type { Effect } from "effect";
import type { AlreadyReviewed } from "../generated/domain/already-reviewed.g.ts";
import type { HostError } from "../generated/domain/host-error.g.ts";
import type { Refused } from "../generated/domain/refused.g.ts";
import type { TargetUrl } from "../generated/domain/target-url.g.ts";
import type { TooLarge } from "../generated/domain/too-large.g.ts";
import type { UnknownFormat } from "../generated/domain/unknown-format.g.ts";
import type { Change } from "./change.ts";
import type { Poster } from "./posting.ts";

type NotReviewable =
	| UnknownFormat
	| AlreadyReviewed
	| TooLarge
	| Refused
	| HostError;

interface Host extends Poster {
	getChange: (url: TargetUrl) => Effect.Effect<Change, NotReviewable>;
}

export type { Host, NotReviewable };
