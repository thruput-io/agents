import { Acknowledgement } from "../domain/acknowledgement.ts";
import { AcknowledgementRequest } from "../domain/acknowledgement-request.ts";
import { Assignment, type AssignmentParts } from "../domain/assignment.ts";
import { Context } from "../domain/context.ts";
import { Definition } from "../domain/definition.ts";
import { Instructions } from "../domain/instructions.ts";
import { Page } from "../domain/page.ts";
import { Probe } from "../domain/probe.ts";
import { Rule } from "../domain/rule.ts";
import type { Defined, Task } from "../domain/task.ts";
import { Usage } from "../domain/usage.ts";
import { Verdict } from "../domain/verdict.ts";
import { Workflow } from "../domain/workflow.ts";
import type { StoredAssignment } from "../generated/perimeters/stored-assignment.g.ts";
import type { StoredDefined } from "../generated/perimeters/stored-defined.g.ts";
import type { StoredHappened } from "../generated/perimeters/stored-happened.g.ts";
import type { StoredTask } from "../generated/perimeters/stored-task.g.ts";
import type { StoredVerdict } from "../generated/perimeters/stored-verdict.g.ts";
import { TermCodec } from "./term.ts";

type StoredInstructions = StoredTask["instructions"];
type Happened = AssignmentParts["happened"];

const verdictFrom = ({ rule }: StoredVerdict): Verdict =>
	Verdict.on(Rule.of(rule));

const storedVerdict = (verdict: Verdict): StoredVerdict => ({
	rule: Rule.shapeOf(Verdict.ruleOf(verdict)),
});

const instructionsFrom = (stored: StoredInstructions): Instructions =>
	Instructions.of({
		workflow: Workflow.of(stored.workflow),
		context: Context.of(stored.context),
		usage: Usage.of(stored.usage),
		request: AcknowledgementRequest.of(stored.request),
	});

const storedInstructions = (instructions: Instructions): StoredInstructions => {
	const { workflow, context, usage, request } =
		Instructions.partsOf(instructions);

	return {
		workflow: Workflow.shapeOf(workflow),
		context: Context.shapeOf(context),
		usage: Usage.shapeOf(usage),
		request: AcknowledgementRequest.shapeOf(request),
	};
};

const taskFrom = (stored: StoredTask): Task => ({
	probe: Probe.of(stored.probe),
	instructions: instructionsFrom(stored.instructions),
	detailed: instructionsFrom(stored.detailed),
	rules: stored.rules.map(Rule.of),
	glossary: stored.glossary.map(
		({ term, definition }: StoredDefined): Defined => [
			TermCodec.decode(term),
			Definition.of(definition),
		],
	),
});

const storedTask = (task: Task): StoredTask => ({
	probe: Probe.shapeOf(task.probe),
	instructions: storedInstructions(task.instructions),
	detailed: storedInstructions(task.detailed),
	rules: task.rules.map(Rule.shapeOf),
	glossary: task.glossary.map(
		([term, definition]: Defined): StoredDefined => ({
			term: TermCodec.encode(term),
			definition: Definition.shapeOf(definition),
		}),
	),
});

const happenedFrom = (stored: StoredHappened): Happened => ({
	acknowledgements: stored.acknowledgements.map(Acknowledgement.of),
	verdicts: stored.verdicts.map(verdictFrom),
	position: stored.position,
});

const storedHappened = (happened: Happened): StoredHappened => ({
	acknowledgements: happened.acknowledgements.map(Acknowledgement.shapeOf),
	verdicts: happened.verdicts.map(storedVerdict),
	position: happened.position,
});

const assignmentFrom = (stored: StoredAssignment): Assignment =>
	Assignment.from({
		task: taskFrom(stored.task),
		pages: stored.pages.map(Page.of),
		happened: happenedFrom(stored.happened),
	});

const storedAssignment = (assignment: Assignment): StoredAssignment => {
	const { task, pages, happened } = Assignment.partsOf(assignment);

	return {
		task: storedTask(task),
		pages: pages.map(Page.shapeOf),
		happened: storedHappened(happened),
	};
};

export { assignmentFrom, storedAssignment, storedVerdict, verdictFrom };
