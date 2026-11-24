import { Effect } from "effect";
import type { NoReview, Probe, Session } from "../../domain/domain.ts";
import type { Assignment, Reviews } from "../../domain/review.ts";

const assignmentIn = (
	reviews: Reviews,
	session: Session,
	probe: Probe,
): Effect.Effect<Assignment, NoReview> =>
	reviews
		.ofSession(session)
		.pipe(Effect.map((ledger) => ledger.assignmentOf(probe)));

export { assignmentIn };
