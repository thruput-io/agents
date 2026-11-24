import type { Effect } from "effect";
import type {
	AlreadyReviewed,
	Definition,
	HostError,
	Instruction,
	NoReview,
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
	instruction: () => Instruction;
	ruleset: () => Ruleset;
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
	session: () => Session;
	status: () => ReviewStatus;
	assignmentOf: (probe: Probe) => Assignment;
	submittedTo: (host: Host) => Effect.Effect<Ledger, HostError>;
}

interface PendingLedger extends Reviewing {
	readonly [pendingLedgerMark]: typeof pendingLedgerMark;
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
