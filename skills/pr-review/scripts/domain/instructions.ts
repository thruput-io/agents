import {
	type AgentInstructions,
	type Change,
	type Checkout,
	type ContextInstructions,
	type ContextKind,
	type ContextPermissions,
	ContextPermissionsSchema,
	type ContextTask,
	ContextTaskSchema,
	type DeadCodeInstructions,
	type DeadCodeKind,
	type DeadCodePermissions,
	DeadCodePermissionsSchema,
	type DeadCodeTask,
	DeadCodeTaskSchema,
	type InstructionsProse,
	InstructionsProseSchema,
	type ReuseInstructions,
	type ReuseKind,
	type ReusePermissions,
	ReusePermissionsSchema,
	type ReuseTask,
	ReuseTaskSchema,
	RULEBOOK_PROBE_KINDS,
	type RulesInstructions,
	type RulesKind,
	type RulesPermissions,
	RulesPermissionsSchema,
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
export type ProbePermissions =
	| RulesPermissions
	| DeadCodePermissions
	| ReusePermissions
	| ContextPermissions;

const TASK_BY_KIND: {
	readonly rules: RulesInstructions["task"];
	readonly "dead-code": DeadCodeInstructions["task"];
	readonly reuse: ReuseInstructions["task"];
	readonly context: ContextInstructions["task"];
} = {
	rules: RulesTaskSchema.decode(undefined),
	"dead-code": DeadCodeTaskSchema.decode(undefined),
	reuse: ReuseTaskSchema.decode(undefined),
	context: ContextTaskSchema.decode(undefined),
};

const PERMISSIONS_BY_KIND: {
	readonly rules: RulesInstructions["permissions"];
	readonly "dead-code": DeadCodeInstructions["permissions"];
	readonly reuse: ReuseInstructions["permissions"];
	readonly context: ContextInstructions["permissions"];
} = {
	rules: RulesPermissionsSchema.decode(undefined),
	"dead-code": DeadCodePermissionsSchema.decode(undefined),
	reuse: ReusePermissionsSchema.decode(undefined),
	context: ContextPermissionsSchema.decode(undefined),
};

export class Instructions {
	static readonly Prose: InstructionsProse =
		InstructionsProseSchema.decode(undefined);
	readonly #prose: InstructionsProse;
	readonly #task: Task;
	readonly #permissions: ProbePermissions;
	private constructor(
		prose: InstructionsProse,
		task: Task,
		permissions: ProbePermissions,
	) {
		this.#prose = prose;
		this.#task = task;
		this.#permissions = permissions;
	}
	static forKind(kind: ProbeKind): Instructions {
		return new Instructions(
			Instructions.Prose,
			TASK_BY_KIND[kind],
			PERMISSIONS_BY_KIND[kind],
		);
	}
	prose(): InstructionsProse {
		return this.#prose;
	}
	task(): Task {
		return this.#task;
	}
	permissions(): ProbePermissions {
		return this.#permissions;
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
				permissions: PERMISSIONS_BY_KIND[probe.kind],
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
				permissions: PERMISSIONS_BY_KIND.context,
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
