const targetUrlMark: unique symbol = Symbol("target URL");
const workdirMark: unique symbol = Symbol("workdir");
const changeMark: unique symbol = Symbol("change");
const surfaceMark: unique symbol = Symbol("surface");

const probeMark: unique symbol = Symbol("probe");
const ruleMark: unique symbol = Symbol("rule");
const termMark: unique symbol = Symbol("term");
const sessionMark: unique symbol = Symbol("session");

const reportMark: unique symbol = Symbol("report");
const verdictMark: unique symbol = Symbol("verdict");
const violationMark: unique symbol = Symbol("violation");
const pendingLedgerMark: unique symbol = Symbol("pending ledger");
const completeLedgerMark: unique symbol = Symbol("complete ledger");
const outcomeMark: unique symbol = Symbol("outcome");
const reviewStatusMark: unique symbol = Symbol("review status");

const unknownFormatMark: unique symbol = Symbol("unknown format");
const alreadyReviewedMark: unique symbol = Symbol("already reviewed");
const tooLargeMark: unique symbol = Symbol("too large");
const refusedMark: unique symbol = Symbol("refused");
const hostErrorMark: unique symbol = Symbol("host error");

export {
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
};
