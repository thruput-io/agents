import { Instructions } from "../domain/instructions.ts";
import type { Rule } from "../domain/rule.ts";
import type { Defined, Probes, Task } from "../domain/task.ts";
import type { Workdir } from "../domain/workdir.ts";
import { rulebook } from "../generated/perimeters/rulebook.g.ts";
import { probeIn } from "./disk.ts";
import { TermCodec } from "./term.ts";
import {
	AcknowledgementRequestCodec,
	ContextCodec,
	DefinitionCodec,
	RuleCodec,
	UsageCodec,
	WorkflowCodec,
} from "./values.ts";

const probesIn = (workdir: Workdir): Probes => {
	const instructions = Instructions.of({
		workflow: WorkflowCodec.decode({}),
		context: ContextCodec.decode({}),
		usage: UsageCodec.decode({}),
		request: AcknowledgementRequestCodec.decode(
			rulebook.acknowledgementRequest,
		),
	});
	const glossary = rulebook.glossary.map(
		([id, text]: readonly [string, string]): Defined => [
			TermCodec.decode(id),
			DefinitionCodec.decode(text),
		],
	);

	return rulebook.probes.map(
		({ name, rules }): Task => ({
			probe: probeIn(workdir, name),
			instructions,
			detailed: instructions,
			rules: rules.map((id: string): Rule => RuleCodec.decode(id)),
			glossary,
		}),
	);
};

export { probesIn };
