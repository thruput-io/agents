import type { Definition } from "../domain/definition.ts";
import type { Probe } from "../domain/probe.ts";
import type { Rule } from "../domain/rule.ts";
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
