import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import type { Agent } from "../../domain/agent.ts";
import { Assignment } from "../../domain/assignment.ts";
import { Assignments } from "../../domain/assignments.ts";
import { Briefing } from "../../domain/briefing.ts";
import type { Change } from "../../domain/change.ts";
import { CompleteReview } from "../../domain/complete-review.ts";
import { Cursor } from "../../domain/cursor.ts";
import type { Host, NotReviewable } from "../../domain/host.ts";
import { Instructions } from "../../domain/instructions.ts";
import type { Review, ReviewStore } from "../../domain/review.ts";
import { Acknowledgement } from "../../generated/domain/acknowledgement.g.ts";
import { AcknowledgementRequest } from "../../generated/domain/acknowledgement-request.g.ts";
import { Context } from "../../generated/domain/context.g.ts";
import { Definition } from "../../generated/domain/definition.g.ts";
import { HostError } from "../../generated/domain/host-error.g.ts";
import type { NoReview } from "../../generated/domain/no-review.g.ts";
import { Outcome } from "../../generated/domain/outcome.g.ts";
import { Probe } from "../../generated/domain/probe.g.ts";
import { Progress } from "../../generated/domain/progress.g.ts";
import { ReviewStatus } from "../../generated/domain/review-status.g.ts";
import { Ruleset } from "../../generated/domain/ruleset.g.ts";
import { Surface } from "../../generated/domain/surface.g.ts";
import { TargetUrl } from "../../generated/domain/target-url.g.ts";
import { Usage } from "../../generated/domain/usage.g.ts";
import { Verdict } from "../../generated/domain/verdict.g.ts";
import type { Workdir } from "../../generated/domain/workdir.g.ts";
import { Workflow } from "../../generated/domain/workflow.g.ts";
import { ProgressController } from "./progress-controller.ts";

const probe: Probe = Effect.runSync(Probe.from("probe-1"));

const request: AcknowledgementRequest = AcknowledgementRequest.create();
const brief: Instructions = Instructions.of({
	workflow: Workflow.create(),
	context: Context.create(),
	usage: Usage.create(),
	request,
});
const detailed: Instructions = Instructions.of({
	workflow: Workflow.create(),
	context: Context.create(),
	usage: Usage.create(),
	request,
});
const ruleset: Ruleset = Ruleset.create();
const definition: Definition = Definition.create();
const following: Surface = Surface.create();
const preceding: Surface = Surface.create();
const progress: Progress = Progress.create();
const expected: Acknowledgement = Effect.runSync(
	Acknowledgement.from("the phrase"),
);
const assignment: Assignment = Assignment.of({
	briefing: Briefing.of(brief, ruleset, definition),
	cursor: Cursor.of(following, preceding),
	progress,
	expected,
	detailed,
});

const complete: CompleteReview = CompleteReview.of({
	url: Effect.runSync(TargetUrl.from("https://host.test/change")),
	outcome: Outcome.create(),
	state: ReviewStatus.create(),
	assignments: Assignments.of([assignment]),
});
type Entry = Parameters<ReviewStore["append"]>[1];

const appended: Entry[] = [];
const terminated: Assignment[] = [];

const host: Host = {
	getChange: (): Effect.Effect<Change, NotReviewable> =>
		Effect.fail(HostError.create()),
	post: (
		_url: TargetUrl,
		outcome: Outcome,
	): Effect.Effect<Outcome, HostError> => Effect.succeed(outcome),
};

const store: ReviewStore = {
	save: (_workdir: Workdir, review: Review): Effect.Effect<Review> =>
		Effect.succeed(review),
	inWorkdir: (): Effect.Effect<Review, NoReview> => Effect.succeed(complete),
	ofProbe: (): Effect.Effect<Assignment, NoReview> =>
		Effect.succeed(assignment),
	append: (_probe: Probe, entry: Entry): Effect.Effect<Review, NoReview> =>
		Effect.sync((): Review => {
			appended.push(entry);

			return complete;
		}),
};

const agent: Agent = {
	spawn: (given: Assignment): Effect.Effect<Assignment> =>
		Effect.succeed(given),
	terminate: (given: Assignment): Effect.Effect<Assignment> =>
		Effect.sync((): Assignment => {
			terminated.push(given);

			return given;
		}),
};

it("ack answers the progress of the assignment", () => {
	const controller: ProgressController = ProgressController.over(
		host,
		store,
		agent,
	);

	assert.equal(Effect.runSync(controller.ack(probe, expected)), progress);
});

it("ack appends the accepted acknowledgement", () => {
	const controller: ProgressController = ProgressController.over(
		host,
		store,
		agent,
	);

	Effect.runSync(controller.ack(probe, expected));

	assert.equal(appended.includes(expected), true);
});

it("ack answers the detailed instructions to another acknowledgement", () => {
	const controller: ProgressController = ProgressController.over(
		host,
		store,
		agent,
	);
	const other: Acknowledgement = Effect.runSync(
		Acknowledgement.from("another phrase"),
	);
	const answered = controller.ack(probe, other);

	assert.equal(Effect.runSync(Effect.flip(answered)), detailed);
});

it("report answers the progress of the assignment", () => {
	const controller: ProgressController = ProgressController.over(
		host,
		store,
		agent,
	);
	const answered = controller.report(probe, Verdict.create());

	assert.equal(Effect.runSync(answered), progress);
});

it("report appends the verdict", () => {
	const verdict: Verdict = Verdict.create();
	const controller: ProgressController = ProgressController.over(
		host,
		store,
		agent,
	);

	Effect.runSync(controller.report(probe, verdict));

	assert.equal(appended.includes(verdict), true);
});

it("report has a complete review terminate its sub agents", () => {
	const controller: ProgressController = ProgressController.over(
		host,
		store,
		agent,
	);

	Effect.runSync(controller.report(probe, Verdict.create()));

	assert.equal(terminated.includes(assignment), true);
});

it("report appends the error of the host and still answers the progress", () => {
	const hostError: HostError = HostError.create();
	const refusing: Host = {
		...host,
		post: (): Effect.Effect<Outcome, HostError> => Effect.fail(hostError),
	};
	const controller: ProgressController = ProgressController.over(
		refusing,
		store,
		agent,
	);
	const answered: Progress = Effect.runSync(
		controller.report(probe, Verdict.create()),
	);

	assert.deepEqual([answered, appended.includes(hostError)], [progress, true]);
});
