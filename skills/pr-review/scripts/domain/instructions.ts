import {
	type AgentInstructions,
	type AgentInstructionsBase,
	AgentInstructionsBaseSchema,
	type Change,
	type Checkout,
	type ContextInstructions,
	type ContextKind,
	type ContextTask,
	ContextTaskSchema,
	type DeadCodeInstructions,
	type DeadCodeKind,
	type DeadCodeTask,
	DeadCodeTaskSchema,
	type InstructionsProse,
	type ReuseInstructions,
	type ReuseKind,
	type ReuseTask,
	ReuseTaskSchema,
	RULEBOOK_PROBE_KINDS,
	type RulesInstructions,
	type RulesKind,
	type RulesTask,
	RulesTaskSchema,
	type Surface,
} from "./contracts.g.ts";

type ProbeKind =
	| RulesKind
	| ReuseKind
	| DeadCodeKind
	| ContextKind
	| AgentInstructions["kind"];
type Task = RulesTask | DeadCodeTask | ReuseTask | ContextTask;

const TASK_BY_KIND: {
	readonly rules: RulesInstructions["task"];
	readonly "dead-code": DeadCodeInstructions["task"];
	readonly reuse: ReuseInstructions["task"];
	readonly context: ContextInstructions["task"];
} = {
	rules: RulesTaskSchema.parse(undefined),
	"dead-code": DeadCodeTaskSchema.parse(undefined),
	reuse: ReuseTaskSchema.parse(undefined),
	context: ContextTaskSchema.parse(undefined),
};

export class Instructions {
	static readonly Prose: AgentInstructionsBase["instructions"] =
		AgentInstructionsBaseSchema.parse({}).instructions;
	readonly #prose: InstructionsProse;
	readonly #task: Task;
	private constructor(prose: InstructionsProse, task: Task) {
		this.#prose = prose;
		this.#task = task;
	}
	static forKind(kind: ProbeKind): Instructions {
		return new Instructions(Instructions.Prose, TASK_BY_KIND[kind]);
	}
	prose(): InstructionsProse {
		return this.#prose;
	}
	task(): Task {
		return this.#task;
	}
}

export function instructions<RulebookSlice, RulesetEntry>(
	context: {
		readonly change: Change;
		readonly surface: Surface;
		readonly checkout: Checkout;
	},
	probes: readonly {
		readonly name: string;
		readonly kind: RulesKind | ReuseKind | DeadCodeKind;
		readonly rulebook: RulebookSlice;
	}[],
	rulesets: readonly RulesetEntry[],
) {
	const checkoutFor = (kind: ProbeKind) =>
		RULEBOOK_PROBE_KINDS.has(kind) ? { checkout: context.checkout } : {};
	const handed = [
		...probes.map((probe) => ({
			name: probe.name,
			document: {
				instructions: Instructions.Prose,
				task: TASK_BY_KIND[probe.kind],
				kind: probe.kind,
				change: context.change,
				surface: context.surface,
				rulebook: probe.rulebook,
				...checkoutFor(probe.kind),
			},
		})),
		{
			name: "context",
			document: {
				instructions: Instructions.Prose,
				task: TASK_BY_KIND.context,
				kind: "context" as const,
				change: context.change,
				surface: context.surface,
				rulesets,
			},
		},
	];
	return handed.map((probe, index) => ({
		name: `${String(index + 1).padStart(2, "0")}-${probe.name}`,
		document: probe.document,
	}));
}
