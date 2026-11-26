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
import { Term } from "../../generated/domain/term.g.ts";
import { Usage } from "../../generated/domain/usage.g.ts";
import type { Workdir } from "../../generated/domain/workdir.g.ts";
import { Workflow } from "../../generated/domain/workflow.g.ts";
import { BriefingController } from "./briefing-controller.ts";

const probe: Probe = Probe.codec.decode("probe-1");
const term: Term = Term.codec.decode("Ledger");

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

it("instructions answers the instructions of the briefing", () => {
	const answered = BriefingController.over(store).instructions(probe);

	assert.equal(Effect.runSync(answered), brief);
});

it("rules answers the rules of the briefing", () => {
	const answered = BriefingController.over(store).rules(probe);

	assert.equal(Effect.runSync(answered), ruleset);
});

it("define answers the definition of the term", () => {
	const answered = BriefingController.over(store).define(probe, term);

	assert.equal(Effect.runSync(answered), definition);
});

it("instructions fails for a probe that holds no review", () => {
	const noReview: NoReview = NoReview.create();
	const empty: ReviewStore = {
		...store,
		ofProbe: (): Effect.Effect<Assignment, NoReview> => Effect.fail(noReview),
	};
	const answered = BriefingController.over(empty).instructions(probe);

	assert.equal(Effect.runSync(Effect.flip(answered)), noReview);
});
