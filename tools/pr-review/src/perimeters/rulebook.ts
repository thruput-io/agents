import { Instructions } from "../domain/instructions.ts";
import type { Probe } from "../domain/probe.ts";
import type { Rule } from "../domain/rule.ts";
import type { Session } from "../domain/session.ts";
import type { Defined, Probes, Task } from "../domain/task.ts";
import { rulebook } from "../generated/perimeters/rulebook.g.ts";
import { heldBy, probeIn } from "./probe-session.ts";
import { TermCodec } from "./term.ts";
import {
	AcknowledgementRequestCodec,
	ContextCodec,
	DefinitionCodec,
	RuleCodec,
	UsageCodec,
	WorkflowCodec,
} from "./values.ts";

type Assigned = (typeof rulebook.probes)[number];

const instructionsOf = (): Instructions =>
	Instructions.of({
		workflow: WorkflowCodec.decode({}),
		context: ContextCodec.decode({}),
		usage: UsageCodec.decode({}),
		request: AcknowledgementRequestCodec.decode(
			rulebook.acknowledgementRequest,
		),
	});

const glossaryOf = (): readonly Defined[] =>
	rulebook.glossary.map(
		([id, text]: readonly [string, string]): Defined => [
			TermCodec.decode(id),
			DefinitionCodec.decode(text),
		],
	);

const taskFor =
	(probe: Probe) =>
	({ rules }: Assigned): Task => ({
		probe,
		instructions: instructionsOf(),
		detailed: instructionsOf(),
		rules: rules.map((id: string): Rule => RuleCodec.decode(id)),
		glossary: glossaryOf(),
	});

const tasksOf = (probe: Probe): Probes =>
	rulebook.probes
		.filter(({ name }: Assigned): boolean => name === heldBy(probe).name)
		.map(taskFor(probe));

const probesIn = (session: Session): Probes =>
	rulebook.probes.flatMap(
		({ name }: Assigned): Probes => tasksOf(probeIn(session, name)),
	);

export { probesIn, tasksOf };
