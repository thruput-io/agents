import type { Effect } from "effect";
import type {
	AlreadyReviewed,
	Definition,
	HostError,
	Instructions,
	Model,
	NoReview,
	NotStarted,
	Outcome,
	Probe,
	Refused,
	Report,
	ReviewStatus,
	Ruleset,
	Session,
	Surface,
	TargetUrl,
	Term,
	TooLarge,
	UnknownFormat,
	Workdir,
} from "./domain.ts";
import type {
	assignmentMark,
	briefingMark,
	changeMark,
	completeLedgerMark,
	cursorMark,
	pendingLedgerMark,
} from "./mark.ts";

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
	acknowledged: () => Ledger;
	recorded: (report: Report) => Ledger;
}

interface Reviewing {
	status: () => ReviewStatus;
	assignmentOf: (probe: Probe) => Assignment;
	submittedTo: (host: Host) => Effect.Effect<Ledger, HostError>;
}

interface PendingLedger extends Reviewing {
	readonly [pendingLedgerMark]: typeof pendingLedgerMark;
	spawnedBy: (agent: Agent, model: Model) => Effect.Effect<Session, NotStarted>;
}

interface CompleteLedger extends Reviewing {
	readonly [completeLedgerMark]: typeof completeLedgerMark;
}

type Ledger = PendingLedger | CompleteLedger;

interface Change {
	readonly [changeMark]: typeof changeMark;
	review: () => PendingLedger;
}

type NotReviewable =
	| UnknownFormat
	| AlreadyReviewed
	| TooLarge
	| Refused
	| HostError;

interface Host {
	getChange: (url: TargetUrl) => Effect.Effect<Change, NotReviewable>;
	post: (url: TargetUrl, outcome: Outcome) => Effect.Effect<Outcome, HostError>;
}

interface Agent {
	spawn: (
		assignment: Assignment,
		model: Model,
	) => Effect.Effect<Assignment, NotStarted>;
	terminate: (assignment: Assignment) => Effect.Effect<Assignment>;
}

interface ReviewStore {
	save: (workdir: Workdir, ledger: Ledger) => Effect.Effect<Ledger>;
	inWorkdir: (workdir: Workdir) => Effect.Effect<Ledger, NoReview>;
	ofSession: (session: Session) => Effect.Effect<Ledger, NoReview>;
	replace: (
		session: Session,
		ledger: Ledger,
	) => Effect.Effect<Ledger, NoReview>;
}

export type {
	Agent,
	Assignment,
	Briefing,
	Change,
	CompleteLedger,
	Cursor,
	Host,
	Ledger,
	NotReviewable,
	PendingLedger,
	ReviewStore,
};
