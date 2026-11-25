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
} from "./domain.ts";
import {
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
import { mint } from "./mint.ts";

const targetUrlFrom = (): TargetUrl => mint({ [targetUrlMark]: targetUrlMark });

const workdirFrom = (): Workdir => mint({ [workdirMark]: workdirMark });

const surfaceFrom = (): Surface => mint({ [surfaceMark]: surfaceMark });

const probeFrom = (): Probe => mint({ [probeMark]: probeMark });

const probesFrom = (): Probes => mint({ [probesMark]: probesMark });

const ruleFrom = (): Rule => mint({ [ruleMark]: ruleMark });

const rulesetFrom = (): Ruleset => mint({ [rulesetMark]: rulesetMark });

const termFrom = (): Term => mint({ [termMark]: termMark });

const definitionFrom = (): Definition =>
	mint({ [definitionMark]: definitionMark });

const workflowFrom = (): Workflow => mint({ [workflowMark]: workflowMark });

const contextFrom = (): Context => mint({ [contextMark]: contextMark });

const usageFrom = (): Usage => mint({ [usageMark]: usageMark });

const acknowledgementRequestFrom = (): AcknowledgementRequest =>
	mint({ [acknowledgementRequestMark]: acknowledgementRequestMark });

const acknowledgementFrom = (): Acknowledgement =>
	mint({ [acknowledgementMark]: acknowledgementMark });

const verdictFrom = (): Verdict => mint({ [verdictMark]: verdictMark });

const violationFrom = (): Violation => mint({ [violationMark]: violationMark });

const outcomeFrom = (): Outcome => mint({ [outcomeMark]: outcomeMark });

const reviewStatusFrom = (): ReviewStatus =>
	mint({ [reviewStatusMark]: reviewStatusMark });

const progressFrom = (): Progress => mint({ [progressMark]: progressMark });

const notStartedFrom = (): NotStarted =>
	mint({ [notStartedMark]: notStartedMark });

const noReviewFrom = (): NoReview => mint({ [noReviewMark]: noReviewMark });

const unknownFormatFrom = (): UnknownFormat =>
	mint({ [unknownFormatMark]: unknownFormatMark });

const alreadyReviewedFrom = (): AlreadyReviewed =>
	mint({ [alreadyReviewedMark]: alreadyReviewedMark });

const tooLargeFrom = (): TooLarge => mint({ [tooLargeMark]: tooLargeMark });

const refusedFrom = (): Refused => mint({ [refusedMark]: refusedMark });

const hostErrorFrom = (): HostError => mint({ [hostErrorMark]: hostErrorMark });

export {
	acknowledgementFrom,
	acknowledgementRequestFrom,
	alreadyReviewedFrom,
	contextFrom,
	definitionFrom,
	hostErrorFrom,
	noReviewFrom,
	notStartedFrom,
	outcomeFrom,
	probeFrom,
	probesFrom,
	progressFrom,
	refusedFrom,
	reviewStatusFrom,
	ruleFrom,
	rulesetFrom,
	surfaceFrom,
	targetUrlFrom,
	termFrom,
	tooLargeFrom,
	unknownFormatFrom,
	usageFrom,
	verdictFrom,
	violationFrom,
	workdirFrom,
	workflowFrom,
};
