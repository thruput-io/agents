import { Instructions } from "../domain/instructions.ts";
import type { Defined, Probes, Task } from "../domain/task.ts";
import { Term } from "../domain/term.ts";
import type { Workdir } from "../domain/workdir.ts";
import { AcknowledgementRequest } from "../generated/domain/acknowledgement-request.g.ts";
import { Context } from "../generated/domain/context.g.ts";
import { Definition } from "../generated/domain/definition.g.ts";
import { Rule } from "../generated/domain/rule.g.ts";
import { Usage } from "../generated/domain/usage.g.ts";
import { Workflow } from "../generated/domain/workflow.g.ts";
import { rulebook } from "../generated/perimeters/rulebook.g.ts";
import { probeIn } from "./disk.ts";

const probesIn = (workdir: Workdir): Probes => {
	const instructions = Instructions.of({
		workflow: Workflow.codec.decode({}),
		context: Context.codec.decode({}),
		usage: Usage.codec.decode({}),
		request: AcknowledgementRequest.codec.decode(
			rulebook.acknowledgementRequest,
		),
	});
	const glossary = rulebook.glossary.map(
		([id, text]: readonly [string, string]): Defined => [
			Term.codec.decode(id),
			Definition.codec.decode(text),
		],
	);

	return rulebook.probes.map(
		({ name, rules }): Task => ({
			probe: probeIn(workdir, name),
			instructions,
			detailed: instructions,
			rules: rules.map((id: string): Rule => Rule.codec.decode(id)),
			glossary,
		}),
	);
};

export { probesIn };
