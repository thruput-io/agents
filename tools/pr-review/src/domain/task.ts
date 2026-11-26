import { z } from "zod";
import { Definition } from "../generated/domain/definition.g.ts";
import { Probe } from "../generated/domain/probe.g.ts";
import { Rule } from "../generated/domain/rule.g.ts";
import { Instructions } from "./instructions.ts";
import { Term } from "./term.ts";

const TaskShape = z.object({
	probe: Probe.codec,
	instructions: Instructions.codec,
	detailed: Instructions.codec,
	rules: z.array(Rule.codec).readonly(),
	glossary: z
		.array(z.tuple([Term.codec, Definition.codec]).readonly())
		.readonly(),
});

type Task = z.output<typeof TaskShape>;
type Defined = Task["glossary"][number];
type Probes = readonly Task[];

export type { Defined, Probes, Task };
export { TaskShape };
