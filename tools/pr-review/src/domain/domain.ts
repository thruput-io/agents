import type {
	alreadyReviewedMark,
	definitionMark,
	hostErrorMark,
	instructionsMark,
	noReviewMark,
	outcomeMark,
	probeMark,
	refusedMark,
	reportMark,
	reviewStatusMark,
	ruleMark,
	rulesetMark,
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

interface Surface {
	readonly [surfaceMark]: typeof surfaceMark;
}

interface Probe {
	readonly [probeMark]: typeof probeMark;
}

interface Rule {
	readonly [ruleMark]: typeof ruleMark;
}

interface Ruleset {
	readonly [rulesetMark]: typeof rulesetMark;
}

interface Term {
	readonly [termMark]: typeof termMark;
}

interface Definition {
	readonly [definitionMark]: typeof definitionMark;
}

interface Instructions {
	readonly [instructionsMark]: typeof instructionsMark;
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

interface Outcome {
	readonly [outcomeMark]: typeof outcomeMark;
}

interface ReviewStatus {
	readonly [reviewStatusMark]: typeof reviewStatusMark;
}

interface NoReview {
	readonly [noReviewMark]: typeof noReviewMark;
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
	Definition,
	HostError,
	Instructions,
	NoReview,
	Outcome,
	Probe,
	Refused,
	Report,
	ReviewStatus,
	Rule,
	Ruleset,
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
