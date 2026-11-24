import type {
	alreadyReviewedMark,
	changeMark,
	completeLedgerMark,
	hostErrorMark,
	outcomeMark,
	pendingLedgerMark,
	probeMark,
	refusedMark,
	reportMark,
	reviewStatusMark,
	ruleMark,
	sessionMark,
	surfaceMark,
	targetUrlMark,
	termMark,
	tooLargeMark,
	unknownFormatMark,
	verdictMark,
	violationMark,
	workdirMark,
} from "./marks.ts";

interface TargetUrl {
	readonly [targetUrlMark]: typeof targetUrlMark;
}

interface Workdir {
	readonly [workdirMark]: typeof workdirMark;
}

interface Change {
	readonly [changeMark]: typeof changeMark;
}

interface Surface {
	readonly [surfaceMark]: typeof surfaceMark;
}

interface Probe {
	readonly [probeMark]: typeof probeMark;
}

interface Rule {
	readonly [ruleMark]: typeof ruleMark;
}

interface Term {
	readonly [termMark]: typeof termMark;
}

interface Session {
	readonly [sessionMark]: typeof sessionMark;
}

interface Report {
	readonly [reportMark]: typeof reportMark;
}

interface Verdict {
	readonly [verdictMark]: typeof verdictMark;
}

interface Violation {
	readonly [violationMark]: typeof violationMark;
}

interface PendingLedger {
	readonly [pendingLedgerMark]: typeof pendingLedgerMark;
}

interface CompleteLedger {
	readonly [completeLedgerMark]: typeof completeLedgerMark;
}

interface Outcome {
	readonly [outcomeMark]: typeof outcomeMark;
}

interface ReviewStatus {
	readonly [reviewStatusMark]: typeof reviewStatusMark;
}

interface UnknownFormat {
	readonly [unknownFormatMark]: typeof unknownFormatMark;
}

interface AlreadyReviewed {
	readonly [alreadyReviewedMark]: typeof alreadyReviewedMark;
}

interface TooLarge {
	readonly [tooLargeMark]: typeof tooLargeMark;
}

interface Refused {
	readonly [refusedMark]: typeof refusedMark;
}

interface HostError {
	readonly [hostErrorMark]: typeof hostErrorMark;
}

export type {
	AlreadyReviewed,
	Change,
	CompleteLedger,
	HostError,
	Outcome,
	PendingLedger,
	Probe,
	Refused,
	Report,
	ReviewStatus,
	Rule,
	Session,
	Surface,
	TargetUrl,
	Term,
	TooLarge,
	UnknownFormat,
	Verdict,
	Violation,
	Workdir,
};
