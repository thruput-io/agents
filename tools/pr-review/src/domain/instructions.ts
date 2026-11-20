import {
	type AgentInstructions,
	type Change,
	type Checkout,
	CONTEXT_TASK_TEMPLATE,
	type ContextInstructions,
	ContextPermissionsSchema,
	ContextTaskSchema,
	type DeadCodeKind,
	DeadCodePermissionsSchema,
	DeadCodeTaskSchema,
	INSTRUCTIONS_PROSE_TEMPLATES,
	type InstructionsProse,
	InstructionsProseSchema,
	PROBE_PROMPT_TEMPLATE,
	type ProbeName,
	type ProbePrompt,
	ProbePromptSchema,
	type ReuseKind,
	ReusePermissionsSchema,
	ReuseTaskSchema,
	RULES_TASK_TEMPLATE,
	type Rulebook,
	type RulebookSummary,
	type RulesKind,
	RulesPermissionsSchema,
	RulesTaskSchema,
	type SessionToken,
	type Surface,
} from "./contracts.g.ts";
import { nonnull } from "./nullish.ts";
import { paginateText, surfaceOverview } from "./pagination.ts";

type ProbeKind = AgentInstructions["kind"];
type Task = AgentInstructions["task"];
type ProbePermissions = AgentInstructions["permissions"];
type RulebookKind = RulesKind | ReuseKind | DeadCodeKind;
type RulebookDoc = Extract<AgentInstructions, { readonly kind: RulebookKind }>;

interface ProbeTarget {
	readonly probeBin: Checkout;
	readonly session: SessionToken;
	readonly probe: ProbeName;
}

const DEFAULT_TARGET: ProbeTarget = {
	probeBin: "/opt/pr-review/dist/bin/review-tool-probe.mjs",
	session: "pr-review-session:default",
	probe: "01-purpose",
};

const substituteTarget = (raw: string, target: ProbeTarget): string =>
	raw
		.replaceAll("<probe-bin>", target.probeBin)
		.replaceAll("<session>", target.session)
		.replaceAll("<probe>", target.probe);

const buildProse = (target: ProbeTarget): InstructionsProse =>
	InstructionsProseSchema.parse(
		INSTRUCTIONS_PROSE_TEMPLATES.map((item) => substituteTarget(item, target)),
	);

const buildPrompt = (target: ProbeTarget): ProbePrompt =>
	ProbePromptSchema.parse(substituteTarget(PROBE_PROMPT_TEMPLATE, target));

const PROMPT_IN_PROSE_PATTERN =
	/"(?<prompt>Run \/[^"]+\/review-tool-probe\.mjs inspect pr-review-session:[A-Za-z0-9_-]+ [0-9]{2}-[a-z0-9-]+ and follow its instructions\.)"/u;

const resolveDefined = <T>(value: T | undefined, fallback: T): T => {
	if (value === undefined) {
		return fallback;
	}
	return value;
};

const resolvePrompt = (
	prose: InstructionsProse,
	fallback: ProbePrompt,
): ProbePrompt => {
	const matched = PROMPT_IN_PROSE_PATTERN.exec(prose[0]);
	if (matched === null) {
		return fallback;
	}
	return ProbePromptSchema.parse(nonnull(matched[1]));
};

const buildTask = (kind: ProbeKind, target: ProbeTarget): Task => {
	const tasks: Record<ProbeKind, () => Task> = {
		rules: () =>
			RulesTaskSchema.parse(substituteTarget(RULES_TASK_TEMPLATE, target)),
		"dead-code": () => DeadCodeTaskSchema.decode(undefined),
		reuse: () => ReuseTaskSchema.decode(undefined),
		context: () =>
			ContextTaskSchema.parse(substituteTarget(CONTEXT_TASK_TEMPLATE, target)),
	};
	return tasks[kind]();
};

const buildPermissions = (
	kind: ProbeKind,
	probeBin: Checkout,
): ProbePermissions => {
	const bash = `Bash(${probeBin}*)`;
	const read = ["Read", "Grep", "Glob"] as const;
	const permissions: Record<ProbeKind, () => ProbePermissions> = {
		rules: () => RulesPermissionsSchema.parse([bash]),
		"dead-code": () => DeadCodePermissionsSchema.parse([...read, "Find", bash]),
		reuse: () =>
			ReusePermissionsSchema.parse([...read, "WebSearch", "WebFetch", bash]),
		context: () => ContextPermissionsSchema.parse([...read, "Find", bash]),
	};
	return permissions[kind]();
};

const CHECKOUT_FIELDS_BY_KIND: Record<
	RulesKind | ReuseKind | DeadCodeKind,
	(checkout: Checkout) => { readonly checkout?: Checkout }
> = {
	rules: () => ({}),
	"dead-code": (checkout) => ({ checkout }),
	reuse: (checkout) => ({ checkout }),
};

class Instructions {
	static readonly PROSE: InstructionsProse = buildProse(DEFAULT_TARGET);
	readonly #prose: InstructionsProse;
	readonly #task: Task;
	readonly #permissions: ProbePermissions;
	readonly #prompt: ProbePrompt;
	private constructor(
		prose: InstructionsProse,
		task: Task,
		permissions: ProbePermissions,
		prompt: ProbePrompt,
	) {
		this.#prose = prose;
		this.#task = task;
		this.#permissions = permissions;
		this.#prompt = prompt;
	}
	static forKind(kind: ProbeKind): Instructions {
		return Instructions.forProbe(kind, DEFAULT_TARGET);
	}
	static forProbe(kind: ProbeKind, target: ProbeTarget): Instructions {
		return new Instructions(
			buildProse(target),
			buildTask(kind, target),
			buildPermissions(kind, target.probeBin),
			buildPrompt(target),
		);
	}
	static fromParts(parts: {
		readonly kind: ProbeKind;
		readonly instructions?: InstructionsProse | undefined;
		readonly task?: Task | undefined;
		readonly permissions?: ProbePermissions | undefined;
	}): Instructions {
		const fallback = Instructions.forKind(parts.kind);
		const prose = resolveDefined(parts.instructions, fallback.prose());
		return new Instructions(
			prose,
			resolveDefined(parts.task, fallback.task()),
			resolveDefined(parts.permissions, fallback.permissions()),
			resolvePrompt(prose, fallback.prompt()),
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
	prompt(): ProbePrompt {
		return this.#prompt;
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

function instructionsForSession<RulebookSlice>(
	context: {
		readonly change: Change;
		readonly surface: Surface;
		readonly checkout: Checkout;
		readonly probeBin: Checkout;
		readonly session: SessionToken;
	},
	probes: readonly {
		readonly name: string;
		readonly kind: RulesKind | ReuseKind | DeadCodeKind;
		readonly rulebook: RulebookSlice;
	}[],
	rulesets: readonly Rulebook[],
) {
	const overview = surfaceOverview(context.surface);
	const specFor = (kind: ProbeKind, probe: string) =>
		Instructions.forProbe(kind, {
			probeBin: context.probeBin,
			session: context.session,
			probe,
		});
	const contextName = `${String(probes.length + 1).padStart(2, "0")}-context`;
	const contextSpec = specFor("context", contextName);
	return [
		...probes.map((probe, index) => {
			const name = `${String(index + 1).padStart(2, "0")}-${probe.name}`;
			const spec = specFor(probe.kind, name);
			return {
				name,
				document: {
					instructions: spec.prose(),
					task: spec.task() as RulebookDoc["task"],
					permissions: spec.permissions() as RulebookDoc["permissions"],
					kind: probe.kind,
					change: context.change,
					surface: overview,
					rulebook: probe.rulebook,
					...CHECKOUT_FIELDS_BY_KIND[probe.kind](context.checkout),
				},
			};
		}),
		{
			name: contextName,
			document: {
				instructions: contextSpec.prose(),
				task: contextSpec.task() as ContextInstructions["task"],
				permissions:
					contextSpec.permissions() as ContextInstructions["permissions"],
				kind: "context" as const,
				change: context.change,
				surface: overview,
				rulesets: toRulebookSummaries(rulesets),
				checkout: context.checkout,
			},
		},
	];
}

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
	return instructionsForSession(
		{
			...context,
			probeBin: DEFAULT_TARGET.probeBin,
			session: DEFAULT_TARGET.session,
		},
		probes,
		rulesets,
	);
}

export type { ProbePermissions };
export {
	Instructions,
	instructions,
	instructionsForSession,
	toRulebookSummaries,
};
