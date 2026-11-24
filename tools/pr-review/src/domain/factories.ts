import type {
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
} from "./domain.ts";
import {
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
import { mint } from "./mint.ts";

const targetUrlFrom = (): TargetUrl => mint({ [targetUrlMark]: targetUrlMark });

const workdirFrom = (): Workdir => mint({ [workdirMark]: workdirMark });

const changeFrom = (): Change => mint({ [changeMark]: changeMark });

const surfaceFrom = (): Surface => mint({ [surfaceMark]: surfaceMark });

const probeFrom = (): Probe => mint({ [probeMark]: probeMark });

const ruleFrom = (): Rule => mint({ [ruleMark]: ruleMark });

const termFrom = (): Term => mint({ [termMark]: termMark });

const sessionFrom = (): Session => mint({ [sessionMark]: sessionMark });

const reportFrom = (): Report => mint({ [reportMark]: reportMark });

const verdictFrom = (): Verdict => mint({ [verdictMark]: verdictMark });

const violationFrom = (): Violation => mint({ [violationMark]: violationMark });

const pendingLedgerFrom = (): PendingLedger =>
	mint({ [pendingLedgerMark]: pendingLedgerMark });

const completeLedgerFrom = (): CompleteLedger =>
	mint({ [completeLedgerMark]: completeLedgerMark });

const outcomeFrom = (): Outcome => mint({ [outcomeMark]: outcomeMark });

const reviewStatusFrom = (): ReviewStatus =>
	mint({ [reviewStatusMark]: reviewStatusMark });

const unknownFormatFrom = (): UnknownFormat =>
	mint({ [unknownFormatMark]: unknownFormatMark });

const alreadyReviewedFrom = (): AlreadyReviewed =>
	mint({ [alreadyReviewedMark]: alreadyReviewedMark });

const tooLargeFrom = (): TooLarge => mint({ [tooLargeMark]: tooLargeMark });

const refusedFrom = (): Refused => mint({ [refusedMark]: refusedMark });

const hostErrorFrom = (): HostError => mint({ [hostErrorMark]: hostErrorMark });

export {
	alreadyReviewedFrom,
	changeFrom,
	completeLedgerFrom,
	hostErrorFrom,
	outcomeFrom,
	pendingLedgerFrom,
	probeFrom,
	refusedFrom,
	reportFrom,
	reviewStatusFrom,
	ruleFrom,
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
