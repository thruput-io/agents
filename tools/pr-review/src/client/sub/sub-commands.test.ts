import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import type { Agent } from "../../domain/agent.ts";
import { Assignment } from "../../domain/assignment.ts";
import { Assignments } from "../../domain/assignments.ts";
import { Briefing } from "../../domain/briefing.ts";
import type { Change } from "../../domain/change.ts";
import { Cursor } from "../../domain/cursor.ts";
import type { Host, NotReviewable } from "../../domain/host.ts";
import { Instructions } from "../../domain/instructions.ts";
import { PendingReview } from "../../domain/pending-review.ts";
import type { Review, ReviewStore } from "../../domain/review.ts";
import { Acknowledgement } from "../../generated/domain/acknowledgement.g.ts";
import { AcknowledgementRequest } from "../../generated/domain/acknowledgement-request.g.ts";
import { Context } from "../../generated/domain/context.g.ts";
import { Definition } from "../../generated/domain/definition.g.ts";
import { HostError } from "../../generated/domain/host-error.g.ts";
import type { NoReview } from "../../generated/domain/no-review.g.ts";
import type { Outcome } from "../../generated/domain/outcome.g.ts";
import { Progress } from "../../generated/domain/progress.g.ts";
import { ReviewStatus } from "../../generated/domain/review-status.g.ts";
import { Ruleset } from "../../generated/domain/ruleset.g.ts";
import { Surface } from "../../generated/domain/surface.g.ts";
import { Usage } from "../../generated/domain/usage.g.ts";
import type { Workdir } from "../../generated/domain/workdir.g.ts";
import { Workflow } from "../../generated/domain/workflow.g.ts";
import { type Commands, run } from "../common/runner.ts";
import { subTool } from "./sub-commands.ts";

const instructions: Instructions = Instructions.of({
	workflow: Workflow.codec.decode({}),
	context: Context.codec.decode({}),
	usage: Usage.codec.decode({}),
	request: AcknowledgementRequest.codec.decode({}),
});
const assignment: Assignment = Assignment.of({
	briefing: Briefing.of(
		instructions,
		Ruleset.codec.decode({}),
		Definition.codec.decode({}),
	),
	cursor: Cursor.of(Surface.codec.decode({}), Surface.codec.decode({})),
	progress: Progress.codec.decode({}),
	expected: Acknowledgement.codec.decode("the phrase"),
	detailed: instructions,
});
const pending: PendingReview = PendingReview.of(
	ReviewStatus.codec.decode({}),
	Assignments.of([assignment]),
);
const fourEmptyParts = '{"workflow":{},"context":{},"usage":{},"request":{}}\n';

const host: Host = {
	getChange: (): Effect.Effect<Change, NotReviewable> =>
		Effect.fail(HostError.create()),
	post: (): Effect.Effect<Outcome, HostError> =>
		Effect.fail(HostError.create()),
};

const store: ReviewStore = {
	save: (_workdir: Workdir, review: Review): Effect.Effect<Review> =>
		Effect.succeed(review),
	inWorkdir: (): Effect.Effect<Review, NoReview> => Effect.succeed(pending),
	ofProbe: (): Effect.Effect<Assignment, NoReview> =>
		Effect.succeed(assignment),
	append: (): Effect.Effect<Review, NoReview> => Effect.succeed(pending),
};

const agent: Agent = {
	spawn: (given: Assignment): Effect.Effect<Assignment> =>
		Effect.succeed(given),
	terminate: (given: Assignment): Effect.Effect<Assignment> =>
		Effect.succeed(given),
};

const commands: Commands = subTool(host, store, agent);

it("instructions answers the four parts of the instructions", () => {
	const printed = Effect.runSync(run(commands, ["instructions", "probe-1"]));

	assert.deepEqual(printed, { line: fourEmptyParts, exitCode: 0 });
});

it("rules answers the ruleset", () => {
	const printed = Effect.runSync(run(commands, ["rules", "probe-1"]));

	assert.deepEqual(printed, { line: "{}\n", exitCode: 0 });
});

it("define answers the definition", () => {
	const printed = Effect.runSync(
		run(commands, ["define", "probe-1", "Ledger"]),
	);

	assert.deepEqual(printed, { line: "{}\n", exitCode: 0 });
});

it("next answers a page of the surface", () => {
	const printed = Effect.runSync(run(commands, ["next", "probe-1"]));

	assert.deepEqual(printed, { line: "{}\n", exitCode: 0 });
});

it("prev answers a page of the surface", () => {
	const printed = Effect.runSync(run(commands, ["prev", "probe-1"]));

	assert.deepEqual(printed, { line: "{}\n", exitCode: 0 });
});

it("ack with the expected acknowledgement answers the progress", () => {
	const printed = Effect.runSync(
		run(commands, ["ack", "probe-1", "the phrase"]),
	);

	assert.deepEqual(printed, { line: "{}\n", exitCode: 0 });
});

it("ack with another acknowledgement answers the detailed instructions", () => {
	const printed = Effect.runSync(
		run(commands, ["ack", "probe-1", "another phrase"]),
	);

	assert.deepEqual(printed, { line: fourEmptyParts, exitCode: 1 });
});

it("a command without its probe is answered as not valid", () => {
	const printed = Effect.runSync(run(commands, ["rules"]));

	assert.deepEqual(printed, {
		line: '{"failure":"not-valid"}\n',
		exitCode: 1,
	});
});

it("-h answers the description of the tool and of each command", () => {
	const printed = Effect.runSync(run(commands, ["-h"]));

	assert.deepEqual(
		[Object.keys(JSON.parse(printed.line).commands), printed.exitCode],
		[["instructions", "ack", "rules", "define", "next", "prev"], 0],
	);
});
