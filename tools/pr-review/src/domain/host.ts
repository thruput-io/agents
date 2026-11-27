import type { Effect } from "effect";
import type { Session } from "../domain/session.ts";
import type { TargetUrl } from "../domain/target-url.ts";
import type { AlreadyReviewed } from "./already-reviewed.ts";
import type { Change } from "./change.ts";
import type { HostError } from "./host-error.ts";
import type { Poster } from "./posting.ts";
import type { Refused } from "./refused.ts";
import type { TooLarge } from "./too-large.ts";
import type { UnknownFormat } from "./unknown-format.ts";

type NotReviewable =
	| UnknownFormat
	| AlreadyReviewed
	| TooLarge
	| Refused
	| HostError;

interface Host extends Poster {
	getChange: (
		url: TargetUrl,
		workdir: Session,
	) => Effect.Effect<Change, NotReviewable>;
}

export type { Host, NotReviewable };
