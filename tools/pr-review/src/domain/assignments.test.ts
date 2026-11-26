import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { Acknowledgement } from "../generated/domain/acknowledgement.g.ts";
import { AcknowledgementRequest } from "../generated/domain/acknowledgement-request.g.ts";
import { Context } from "../generated/domain/context.g.ts";
import { Definition } from "../generated/domain/definition.g.ts";
import { NotStarted } from "../generated/domain/not-started.g.ts";
import { Progress } from "../generated/domain/progress.g.ts";
import { Ruleset } from "../generated/domain/ruleset.g.ts";
import { Surface } from "../generated/domain/surface.g.ts";
import { Usage } from "../generated/domain/usage.g.ts";
import { Workflow } from "../generated/domain/workflow.g.ts";
import type { Agent } from "./agent.ts";
import { Assignment } from "./assignment.ts";
import { Assignments } from "./assignments.ts";
import { Briefing } from "./briefing.ts";
import { Cursor } from "./cursor.ts";
import { Instructions } from "./instructions.ts";

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

const spawned: Assignment[] = [];
const terminated: Assignment[] = [];
const agent: Agent = {
	spawn: (given: Assignment): Effect.Effect<Assignment> =>
		Effect.sync((): Assignment => {
			spawned.push(given);

			return given;
		}),
	terminate: (given: Assignment): Effect.Effect<Assignment> =>
		Effect.sync((): Assignment => {
			terminated.push(given);

			return given;
		}),
};

it("assignments are each spawned by the agent", () => {
	Effect.runSync(Assignments.of([assignment]).spawnedBy(agent));

	assert.deepEqual(spawned, [assignment]);
});

it("spawned assignments answer themselves", () => {
	const assignments: Assignments = Assignments.of([assignment]);

	assert.equal(Effect.runSync(assignments.spawnedBy(agent)), assignments);
});

it("assignments fail when the agent starts no sub agent", () => {
	const notStarted: NotStarted = NotStarted.create();
	const stalling: Agent = {
		...agent,
		spawn: (): Effect.Effect<Assignment, NotStarted> => Effect.fail(notStarted),
	};
	const failed = Assignments.of([assignment]).spawnedBy(stalling);

	assert.equal(Effect.runSync(Effect.flip(failed)), notStarted);
});

it("assignments are each terminated by the agent", () => {
	Effect.runSync(Assignments.of([assignment]).dismissedBy(agent));

	assert.deepEqual(terminated, [assignment]);
});

it("no assignments spawn nothing", () => {
	const idle: Agent = {
		...agent,
		spawn: (): Effect.Effect<Assignment, NotStarted> =>
			Effect.fail(NotStarted.create()),
	};
	const none: Assignments = Assignments.of([]);

	assert.equal(Effect.runSync(none.spawnedBy(idle)), none);
});
