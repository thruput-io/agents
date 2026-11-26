import { Effect } from "effect";
import {
	acknowledgementRequestFrom,
	contextFrom,
	definitionFrom,
	outcomeFrom,
	progressFrom,
	reviewStatusFrom,
	rulesetFrom,
	surfaceFrom,
	usageFrom,
	workflowFrom,
} from "../generated/domain/factory.g.ts";
import type {
	Acknowledgement,
	TargetUrl,
} from "../generated/domain/value.g.ts";
import { mint } from "./mint.ts";
import type {
	Agent,
	Assignment,
	Briefing,
	Change,
	CompleteReview,
	Cursor,
	Host,
	Instructions,
	PendingReview,
} from "./review.ts";
import {
	assignmentMark,
	briefingMark,
	changeMark,
	completeReviewMark,
	cursorMark,
	instructionsMark,
	pendingReviewMark,
} from "./review-mark.ts";

const instructionsFrom = (): Instructions =>
	mint({
		[instructionsMark]: instructionsMark,
		workflow: () => workflowFrom(),
		context: () => contextFrom(),
		usage: () => usageFrom(),
		request: () => acknowledgementRequestFrom(),
	});

const briefingFrom = (): Briefing =>
	mint({
		[briefingMark]: briefingMark,
		instructions: () => instructionsFrom(),
		rules: () => rulesetFrom(),
		definitionOf: () => definitionFrom(),
	});

const cursorFrom = (): Cursor =>
	mint({
		[cursorMark]: cursorMark,
		next: () => surfaceFrom(),
		previous: () => surfaceFrom(),
	});

const assignmentFrom = (): Assignment =>
	mint({
		[assignmentMark]: assignmentMark,
		briefing: () => briefingFrom(),
		cursor: () => cursorFrom(),
		accepted: (acknowledgement: Acknowledgement) =>
			Effect.succeed(acknowledgement),
		progress: () => progressFrom(),
	});

function pendingReviewFrom(): PendingReview {
	return mint({
		[pendingReviewMark]: pendingReviewMark,
		status: () => reviewStatusFrom(),
		submittedTo: () => Effect.succeed(pendingReviewFrom()),
		dismissedBy: () => Effect.succeed(pendingReviewFrom()),
		spawnedBy: (agent: Agent) =>
			Effect.map(agent.spawn(assignmentFrom()), () => pendingReviewFrom()),
	});
}

function completeReviewFrom(url: TargetUrl): CompleteReview {
	return mint({
		[completeReviewMark]: completeReviewMark,
		status: () => reviewStatusFrom(),
		submittedTo: (host: Host) =>
			Effect.map(host.post(url, outcomeFrom()), () => completeReviewFrom(url)),
		dismissedBy: (agent: Agent) =>
			Effect.map(agent.terminate(assignmentFrom()), () =>
				completeReviewFrom(url),
			),
	});
}

const changeFrom = (): Change =>
	mint({
		[changeMark]: changeMark,
		review: () => pendingReviewFrom(),
	});

export { assignmentFrom, changeFrom, completeReviewFrom, pendingReviewFrom };
