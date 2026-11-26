const changeMark: unique symbol = Symbol("Change");
const pendingReviewMark: unique symbol = Symbol("PendingReview");
const completeReviewMark: unique symbol = Symbol("CompleteReview");
const assignmentMark: unique symbol = Symbol("Assignment");
const briefingMark: unique symbol = Symbol("Briefing");
const cursorMark: unique symbol = Symbol("Cursor");
const instructionsMark: unique symbol = Symbol("Instructions");

export {
	assignmentMark,
	briefingMark,
	changeMark,
	completeReviewMark,
	cursorMark,
	instructionsMark,
	pendingReviewMark,
};
