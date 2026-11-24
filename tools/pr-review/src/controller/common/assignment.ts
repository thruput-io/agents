import { Effect } from "effect";
import type { NoReview, Probe, Session } from "../../domain/domain.ts";
import type { Assignment, ReviewStore } from "../../domain/review.ts";

const assignmentIn = (
	store: ReviewStore,
	session: Session,
	probe: Probe,
): Effect.Effect<Assignment, NoReview> =>
	store
		.ofSession(session)
		.pipe(Effect.map((ledger) => ledger.assignmentOf(probe)));

export { assignmentIn };
