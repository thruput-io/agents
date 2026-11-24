import type { Effect } from "effect";
import type {
	AlreadyReviewed,
	Definition,
	HostError,
	Instructions,
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
	pagesMark,
	pendingLedgerMark,
} from "./marks.ts";

interface Briefing {
	readonly [briefingMark]: typeof briefingMark;
	instructions: () => Instructions;
	rules: () => Ruleset;
	definitionOf: (term: Term) => Definition;
}

interface Pages {
	readonly [pagesMark]: typeof pagesMark;
	next: () => Surface;
	previous: () => Surface;
}

interface Assignment {
	readonly [assignmentMark]: typeof assignmentMark;
	briefing: () => Briefing;
	pages: () => Pages;
	acknowledged: () => Ledger;
	recorded: (report: Report) => Ledger;
}

interface Reviewing {
	session: () => Session;
	status: () => ReviewStatus;
	assignmentOf: (probe: Probe) => Assignment;
	submittedTo: (hosts: Hosts) => Effect.Effect<Ledger, HostError>;
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

interface Hosts {
	getChange: (url: TargetUrl) => Effect.Effect<Change, NotReviewable>;
	post: (url: TargetUrl, outcome: Outcome) => Effect.Effect<Outcome, HostError>;
}

interface Reviews {
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
	Hosts,
	Ledger,
	NotReviewable,
	Pages,
	PendingLedger,
	Reviews,
};
