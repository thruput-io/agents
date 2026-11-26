import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { Assignment } from "../../domain/assignment.ts";
import { Briefing } from "../../domain/briefing.ts";
import { Cursor } from "../../domain/cursor.ts";
import { Instructions } from "../../domain/instructions.ts";
import type { Review, ReviewStore } from "../../domain/review.ts";
import { Acknowledgement } from "../../generated/domain/acknowledgement.g.ts";
import { AcknowledgementRequest } from "../../generated/domain/acknowledgement-request.g.ts";
import { Context } from "../../generated/domain/context.g.ts";
import { Definition } from "../../generated/domain/definition.g.ts";
import { NoReview } from "../../generated/domain/no-review.g.ts";
import { Probe } from "../../generated/domain/probe.g.ts";
import { Progress } from "../../generated/domain/progress.g.ts";
import { Ruleset } from "../../generated/domain/ruleset.g.ts";
import { Surface } from "../../generated/domain/surface.g.ts";
import { Usage } from "../../generated/domain/usage.g.ts";
import type { Workdir } from "../../generated/domain/workdir.g.ts";
import { Workflow } from "../../generated/domain/workflow.g.ts";
import { PagingController } from "./paging-controller.ts";

const probe: Probe = Probe.codec.decode("probe-1");

const request: AcknowledgementRequest = AcknowledgementRequest.codec.decode({});
const brief: Instructions = Instructions.of({
	workflow: Workflow.codec.decode({}),
	context: Context.codec.decode({}),
	usage: Usage.codec.decode({}),
	request,
});
const detailed: Instructions = Instructions.of({
	workflow: Workflow.codec.decode({}),
	context: Context.codec.decode({}),
	usage: Usage.codec.decode({}),
	request,
});
const ruleset: Ruleset = Ruleset.codec.decode({});
const definition: Definition = Definition.codec.decode({});
const following: Surface = Surface.codec.decode({});
const preceding: Surface = Surface.codec.decode({});
const progress: Progress = Progress.codec.decode({});
const expected: Acknowledgement = Acknowledgement.codec.decode("the phrase");
const assignment: Assignment = Assignment.of({
	briefing: Briefing.of(brief, ruleset, definition),
	cursor: Cursor.of(following, preceding),
	progress,
	expected,
	detailed,
});

const store: ReviewStore = {
	save: (_workdir: Workdir, review: Review): Effect.Effect<Review> =>
		Effect.succeed(review),
	inWorkdir: (): Effect.Effect<Review, NoReview> =>
		Effect.fail(NoReview.create()),
	ofProbe: (): Effect.Effect<Assignment, NoReview> =>
		Effect.succeed(assignment),
	append: (): Effect.Effect<Review, NoReview> => Effect.fail(NoReview.create()),
};

it("next answers the following page", () => {
	const answered = PagingController.over(store).next(probe);

	assert.equal(Effect.runSync(answered), following);
});

it("prev answers the preceding page", () => {
	const answered = PagingController.over(store).prev(probe);

	assert.equal(Effect.runSync(answered), preceding);
});
