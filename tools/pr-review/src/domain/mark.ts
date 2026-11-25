const targetUrlMark: unique symbol = Symbol("target url");
const workdirMark: unique symbol = Symbol("workdir");
const surfaceMark: unique symbol = Symbol("surface");
const probeMark: unique symbol = Symbol("probe");
const probesMark: unique symbol = Symbol("probes");
const ruleMark: unique symbol = Symbol("rule");
const rulesetMark: unique symbol = Symbol("ruleset");
const termMark: unique symbol = Symbol("term");
const definitionMark: unique symbol = Symbol("definition");
const workflowMark: unique symbol = Symbol("workflow");
const contextMark: unique symbol = Symbol("context");
const usageMark: unique symbol = Symbol("usage");
const acknowledgementRequestMark: unique symbol = Symbol(
	"acknowledgement request",
);
const acknowledgementMark: unique symbol = Symbol("acknowledgement");
const verdictMark: unique symbol = Symbol("verdict");
const violationMark: unique symbol = Symbol("violation");
const outcomeMark: unique symbol = Symbol("outcome");
const reviewStatusMark: unique symbol = Symbol("review status");
const progressMark: unique symbol = Symbol("progress");
const notStartedMark: unique symbol = Symbol("not started");
const noReviewMark: unique symbol = Symbol("no review");
const unknownFormatMark: unique symbol = Symbol("unknown format");
const alreadyReviewedMark: unique symbol = Symbol("already reviewed");
const tooLargeMark: unique symbol = Symbol("too large");
const refusedMark: unique symbol = Symbol("refused");
const hostErrorMark: unique symbol = Symbol("host error");
const changeMark: unique symbol = Symbol("change");
const pendingReviewMark: unique symbol = Symbol("pending review");
const completeReviewMark: unique symbol = Symbol("complete review");
const assignmentMark: unique symbol = Symbol("assignment");
const briefingMark: unique symbol = Symbol("briefing");
const cursorMark: unique symbol = Symbol("cursor");
const instructionsMark: unique symbol = Symbol("instructions");

export {
	acknowledgementMark,
	acknowledgementRequestMark,
	alreadyReviewedMark,
	assignmentMark,
	briefingMark,
	changeMark,
	completeReviewMark,
	contextMark,
	cursorMark,
	definitionMark,
	hostErrorMark,
	instructionsMark,
	noReviewMark,
	notStartedMark,
	outcomeMark,
	pendingReviewMark,
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
};
