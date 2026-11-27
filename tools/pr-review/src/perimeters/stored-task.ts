import { AcknowledgementRequest } from "../domain/acknowledgement-request.ts";
import { Context } from "../domain/context.ts";
import { Definition } from "../domain/definition.ts";
import { Instructions } from "../domain/instructions.ts";
import { Probe } from "../domain/probe.ts";
import { Rule } from "../domain/rule.ts";
import type { Defined, Task } from "../domain/task.ts";
import { Usage } from "../domain/usage.ts";
import { Verdict } from "../domain/verdict.ts";
import { Workflow } from "../domain/workflow.ts";
import type { StoredDefined } from "../generated/perimeters/stored-defined.g.ts";
import type { StoredTask } from "../generated/perimeters/stored-task.g.ts";
import type { StoredVerdict } from "../generated/perimeters/stored-verdict.g.ts";
import { TermCodec } from "./term.ts";
import {
	AcknowledgementRequestCodec,
	ContextCodec,
	DefinitionCodec,
	ProbeCodec,
	RuleCodec,
	UsageCodec,
	WorkflowCodec,
} from "./values.ts";

type StoredInstructions = StoredTask["instructions"];

const verdictFrom = ({ rule }: StoredVerdict): Verdict =>
	Verdict.on(Rule.of(rule));

const storedVerdict = (verdict: Verdict): StoredVerdict => ({
	rule: verdict.foldedBy(RuleCodec),
});

const instructionsFrom = (stored: StoredInstructions): Instructions =>
	Instructions.of({
		workflow: Workflow.of(stored.workflow),
		context: Context.of(stored.context),
		usage: Usage.of(stored.usage),
		request: AcknowledgementRequest.of(stored.request),
	});

const storedInstructions = (
	instructions: Instructions,
): StoredInstructions => ({
	workflow: WorkflowCodec.encode(instructions.workflow()),
	context: ContextCodec.encode(instructions.context()),
	usage: UsageCodec.encode(instructions.usage()),
	request: AcknowledgementRequestCodec.encode(instructions.request()),
});

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
	probe: ProbeCodec.encode(task.probe),
	instructions: storedInstructions(task.instructions),
	detailed: storedInstructions(task.detailed),
	rules: task.rules.map((rule: Rule): string => RuleCodec.encode(rule)),
	glossary: task.glossary.map(
		([term, definition]: Defined): StoredDefined => ({
			term: TermCodec.encode(term),
			definition: DefinitionCodec.encode(definition),
		}),
	),
});

export { storedTask, storedVerdict, taskFrom, verdictFrom };
