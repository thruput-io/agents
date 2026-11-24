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
} from "./domain.ts";
import {
	alreadyReviewedMark,
	definitionMark,
	hostErrorMark,
	instructionsMark,
	modelMark,
	noReviewMark,
	notStartedMark,
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
} from "./mark.ts";
import { mint } from "./mint.ts";

const targetUrlFrom = (): TargetUrl => mint({ [targetUrlMark]: targetUrlMark });

const workdirFrom = (): Workdir => mint({ [workdirMark]: workdirMark });

const surfaceFrom = (): Surface => mint({ [surfaceMark]: surfaceMark });

const probeFrom = (): Probe => mint({ [probeMark]: probeMark });

const ruleFrom = (): Rule => mint({ [ruleMark]: ruleMark });

const rulesetFrom = (): Ruleset => mint({ [rulesetMark]: rulesetMark });

const termFrom = (): Term => mint({ [termMark]: termMark });

const definitionFrom = (): Definition =>
	mint({ [definitionMark]: definitionMark });

const instructionsFrom = (): Instructions =>
	mint({ [instructionsMark]: instructionsMark });

const sessionFrom = (): Session => mint({ [sessionMark]: sessionMark });

const reportFrom = (): Report => mint({ [reportMark]: reportMark });

const verdictFrom = (): Verdict => mint({ [verdictMark]: verdictMark });

const violationFrom = (): Violation => mint({ [violationMark]: violationMark });

const outcomeFrom = (): Outcome => mint({ [outcomeMark]: outcomeMark });

const reviewStatusFrom = (): ReviewStatus =>
	mint({ [reviewStatusMark]: reviewStatusMark });

const modelFrom = (): Model => mint({ [modelMark]: modelMark });

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
	alreadyReviewedFrom,
	definitionFrom,
	hostErrorFrom,
	instructionsFrom,
	modelFrom,
	noReviewFrom,
	notStartedFrom,
	outcomeFrom,
	probeFrom,
	refusedFrom,
	reportFrom,
	reviewStatusFrom,
	ruleFrom,
	rulesetFrom,
	sessionFrom,
	surfaceFrom,
	targetUrlFrom,
	termFrom,
	tooLargeFrom,
	unknownFormatFrom,
	verdictFrom,
	violationFrom,
	workdirFrom,
};
