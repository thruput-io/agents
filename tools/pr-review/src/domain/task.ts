import type { Definition } from "../generated/domain/definition.g.ts";
import type { Probe } from "../generated/domain/probe.g.ts";
import type { Rule } from "../generated/domain/rule.g.ts";
import type { Instructions } from "./instructions.ts";
import type { Term } from "./term.ts";

type Defined = readonly [Term, Definition];

interface Task {
	readonly probe: Probe;
	readonly instructions: Instructions;
	readonly detailed: Instructions;
	readonly rules: readonly Rule[];
	readonly glossary: readonly Defined[];
}

type Probes = readonly Task[];

export type { Defined, Probes, Task };
