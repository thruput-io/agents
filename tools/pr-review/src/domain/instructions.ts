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
	type Rulebook,
	type RulebookSummary,
	type RulesInstructions,
	type RulesKind,
	type RulesPermissions,
	RulesPermissionsSchema,
	type RulesTask,
	RulesTaskSchema,
	type Surface,
} from "./contracts.g.ts";
import { paginateText, surfaceOverview } from "./pagination.ts";

type ProbeKind =
	| RulesKind
	| ReuseKind
	| DeadCodeKind
	| ContextKind
	| AgentInstructions["kind"];
type Task = RulesTask | DeadCodeTask | ReuseTask | ContextTask;
type ProbePermissions =
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
	rules: RulesTaskSchema.parse(undefined),
	"dead-code": DeadCodeTaskSchema.parse(undefined),
	reuse: ReuseTaskSchema.parse(undefined),
	context: ContextTaskSchema.parse(undefined),
};

const PERMISSIONS_BY_KIND: {
	readonly rules: RulesInstructions["permissions"];
	readonly "dead-code": DeadCodeInstructions["permissions"];
	readonly reuse: ReuseInstructions["permissions"];
	readonly context: ContextInstructions["permissions"];
} = {
	rules: RulesPermissionsSchema.parse(undefined),
	"dead-code": DeadCodePermissionsSchema.parse(undefined),
	reuse: ReusePermissionsSchema.parse(undefined),
	context: ContextPermissionsSchema.parse(undefined),
};

const CHECKOUT_FIELDS_BY_KIND: Record<
	RulesKind | ReuseKind | DeadCodeKind,
	(checkout: Checkout) => { readonly checkout?: Checkout }
> = {
	rules: () => ({}),
	"dead-code": (checkout) => ({ checkout }),
	reuse: (checkout) => ({ checkout }),
};

const resolveDefined = <T>(value: T | undefined, fallback: T): T => {
	if (value === undefined) {
		return fallback;
	}
	return value;
};

class Instructions {
	static readonly PROSE: InstructionsProse =
		InstructionsProseSchema.parse(undefined);
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
			Instructions.PROSE,
			TASK_BY_KIND[kind],
			PERMISSIONS_BY_KIND[kind],
		);
	}
	static fromParts(parts: {
		readonly kind: ProbeKind;
		readonly instructions?: InstructionsProse | undefined;
		readonly task?: Task | undefined;
		readonly permissions?: ProbePermissions | undefined;
	}): Instructions {
		const fallback = Instructions.forKind(parts.kind);
		return new Instructions(
			resolveDefined(parts.instructions, fallback.prose()),
			resolveDefined(parts.task, fallback.task()),
			resolveDefined(parts.permissions, fallback.permissions()),
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

const toRulebookSummaries = (
	rulesets: readonly Rulebook[],
): readonly RulebookSummary[] =>
	rulesets.map(({ url, title, focus, whenToUse, text }) => ({
		url,
		title,
		focus,
		whenToUse,
		totalPages: paginateText(text).length,
	}));

function instructions<RulebookSlice>(
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
	rulesets: readonly Rulebook[],
) {
	const overview = surfaceOverview(context.surface);
	const summaries = toRulebookSummaries(rulesets);
	const handed = [
		...probes.map((probe) => ({
			name: probe.name,
			document: {
				instructions: Instructions.PROSE,
				task: TASK_BY_KIND[probe.kind],
				permissions: PERMISSIONS_BY_KIND[probe.kind],
				kind: probe.kind,
				change: context.change,
				surface: overview,
				rulebook: probe.rulebook,
				...CHECKOUT_FIELDS_BY_KIND[probe.kind](context.checkout),
			},
		})),
		{
			name: "context",
			document: {
				instructions: Instructions.PROSE,
				task: TASK_BY_KIND.context,
				permissions: PERMISSIONS_BY_KIND.context,
				kind: "context" as const,
				change: context.change,
				surface: overview,
				rulesets: summaries,
				checkout: context.checkout,
			},
		},
	];
	return handed.map((probe, index) => ({
		name: `${String(index + 1).padStart(2, "0")}-${probe.name}`,
		document: probe.document,
	}));
}

export type { ProbePermissions };
export { Instructions, instructions, toRulebookSummaries };
