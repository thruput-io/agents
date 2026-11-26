import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { Acknowledgement } from "../generated/domain/acknowledgement.g.ts";
import { AcknowledgementRequest } from "../generated/domain/acknowledgement-request.g.ts";
import { Context } from "../generated/domain/context.g.ts";
import { Definition } from "../generated/domain/definition.g.ts";
import { Progress } from "../generated/domain/progress.g.ts";
import { Ruleset } from "../generated/domain/ruleset.g.ts";
import { Surface } from "../generated/domain/surface.g.ts";
import { Term } from "../generated/domain/term.g.ts";
import { Usage } from "../generated/domain/usage.g.ts";
import { Workflow } from "../generated/domain/workflow.g.ts";
import { Assignment } from "./assignment.ts";
import { Briefing } from "./briefing.ts";
import { Cursor } from "./cursor.ts";
import { Instructions } from "./instructions.ts";

const term: Term = Effect.runSync(Term.from("Ledger"));

const workflow: Workflow = Workflow.create();
const request: AcknowledgementRequest = AcknowledgementRequest.create();
const brief: Instructions = Instructions.of({
	workflow,
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
const briefing: Briefing = Briefing.of(brief, ruleset, definition);
const following: Surface = Surface.create();
const preceding: Surface = Surface.create();
const cursor: Cursor = Cursor.of(following, preceding);
const progress: Progress = Progress.create();
const expected: Acknowledgement = Effect.runSync(
	Acknowledgement.from("the phrase"),
);
const assignment: Assignment = Assignment.of({
	briefing,
	cursor,
	progress,
	expected,
	detailed,
});

it("an assignment answers the briefing it holds", () => {
	assert.equal(assignment.briefing(), briefing);
});

it("an assignment answers the cursor it holds", () => {
	assert.equal(assignment.cursor(), cursor);
});

it("an assignment answers the progress it holds", () => {
	assert.equal(assignment.progress(), progress);
});

it("an assignment accepts the acknowledgement it expects", () => {
	const sent: Acknowledgement = Effect.runSync(
		Acknowledgement.from("the phrase"),
	);

	assert.equal(Effect.runSync(assignment.accepted(sent)), sent);
});

it("an assignment answers the detailed instructions to another acknowledgement", () => {
	const sent: Acknowledgement = Effect.runSync(
		Acknowledgement.from("another phrase"),
	);

	assert.equal(
		Effect.runSync(Effect.flip(assignment.accepted(sent))),
		detailed,
	);
});

it("a briefing answers the instructions it holds", () => {
	assert.equal(briefing.instructions(), brief);
});

it("a briefing answers the rules it holds", () => {
	assert.equal(briefing.rules(), ruleset);
});

it("a briefing answers the definition it holds", () => {
	assert.equal(briefing.definitionOf(term), definition);
});

it("a cursor answers the following page it holds", () => {
	assert.equal(cursor.next(), following);
});

it("a cursor answers the preceding page it holds", () => {
	assert.equal(cursor.previous(), preceding);
});

it("instructions answer the workflow they hold", () => {
	assert.equal(brief.workflow(), workflow);
});
