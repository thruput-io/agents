import type { Effect } from "effect";
import type {
	Acknowledgement,
	AcknowledgementRequest,
	AlreadyReviewed,
	Context,
	Definition,
	HostError,
	NoReview,
	NotStarted,
	Outcome,
	Probe,
	Probes,
	Progress,
	Refused,
	ReviewStatus,
	Ruleset,
	Surface,
	TargetUrl,
	Term,
	TooLarge,
	UnknownFormat,
	Usage,
	Verdict,
	Workdir,
	Workflow,
} from "../generated/domain/value.g.ts";
import type {
	assignmentMark,
	briefingMark,
	changeMark,
	completeReviewMark,
	cursorMark,
	instructionsMark,
	pendingReviewMark,
} from "./review-mark.ts";

interface Instructions {
	readonly [instructionsMark]: typeof instructionsMark;
	workflow: () => Workflow;
	context: () => Context;
	usage: () => Usage;
	request: () => AcknowledgementRequest;
}

interface Briefing {
	readonly [briefingMark]: typeof briefingMark;
	instructions: () => Instructions;
	rules: () => Ruleset;
	definitionOf: (term: Term) => Definition;
}

interface Cursor {
	readonly [cursorMark]: typeof cursorMark;
	next: () => Surface;
	previous: () => Surface;
}

interface Assignment {
	readonly [assignmentMark]: typeof assignmentMark;
	briefing: () => Briefing;
	cursor: () => Cursor;
	accepted: (
		acknowledgement: Acknowledgement,
	) => Effect.Effect<Acknowledgement, Instructions>;
	progress: () => Progress;
}

interface Reviewing {
	status: () => ReviewStatus;
	submittedTo: (host: Host) => Effect.Effect<Review, HostError>;
	dismissedBy: (agent: Agent) => Effect.Effect<Review>;
}

interface PendingReview extends Reviewing {
	readonly [pendingReviewMark]: typeof pendingReviewMark;
	spawnedBy: (agent: Agent) => Effect.Effect<PendingReview, NotStarted>;
}

interface CompleteReview extends Reviewing {
	readonly [completeReviewMark]: typeof completeReviewMark;
}

type Review = PendingReview | CompleteReview;

interface Change {
	readonly [changeMark]: typeof changeMark;
	review: (probes: Probes) => PendingReview;
}

type NotReviewable =
	| UnknownFormat
	| AlreadyReviewed
	| TooLarge
	| Refused
	| HostError;

type Entry = Acknowledgement | Verdict | HostError;

interface Host {
	getChange: (url: TargetUrl) => Effect.Effect<Change, NotReviewable>;
	post: (url: TargetUrl, outcome: Outcome) => Effect.Effect<Outcome, HostError>;
}

interface ReviewStore {
	save: (workdir: Workdir, review: Review) => Effect.Effect<Review>;
	inWorkdir: (workdir: Workdir) => Effect.Effect<Review, NoReview>;
	ofProbe: (probe: Probe) => Effect.Effect<Assignment, NoReview>;
	append: (probe: Probe, entry: Entry) => Effect.Effect<Review, NoReview>;
}

interface Agent {
	spawn: (assignment: Assignment) => Effect.Effect<Assignment, NotStarted>;
	terminate: (assignment: Assignment) => Effect.Effect<Assignment>;
}

export type {
	Agent,
	Assignment,
	Briefing,
	Change,
	CompleteReview,
	Cursor,
	Entry,
	Host,
	Instructions,
	NotReviewable,
	PendingReview,
	ReviewStore,
};
