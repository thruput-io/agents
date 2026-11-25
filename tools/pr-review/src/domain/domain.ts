import type {
	acknowledgementMark,
	acknowledgementRequestMark,
	alreadyReviewedMark,
	contextMark,
	definitionMark,
	hostErrorMark,
	noReviewMark,
	notStartedMark,
	outcomeMark,
	probeMark,
	probesMark,
	progressMark,
	refusedMark,
	reviewStatusMark,
	ruleMark,
	rulesetMark,
	surfaceMark,
	targetUrlMark,
	termMark,
	tooLargeMark,
	unknownFormatMark,
	usageMark,
	verdictMark,
	violationMark,
	workdirMark,
	workflowMark,
} from "./mark.ts";

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

interface Probes {
	readonly [probesMark]: typeof probesMark;
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

interface Workflow {
	readonly [workflowMark]: typeof workflowMark;
}

interface Context {
	readonly [contextMark]: typeof contextMark;
}

interface Usage {
	readonly [usageMark]: typeof usageMark;
}

interface AcknowledgementRequest {
	readonly [acknowledgementRequestMark]: typeof acknowledgementRequestMark;
}

interface Acknowledgement {
	readonly [acknowledgementMark]: typeof acknowledgementMark;
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

interface Progress {
	readonly [progressMark]: typeof progressMark;
}

interface NotStarted {
	readonly [notStartedMark]: typeof notStartedMark;
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
	Rule,
	Ruleset,
	Surface,
	TargetUrl,
	Term,
	TooLarge,
	UnknownFormat,
	Usage,
	Verdict,
	Violation,
	Workdir,
	Workflow,
};
