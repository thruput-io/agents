import type {
	AgentInstructions,
	Change,
	Checkout,
	ContextKind,
	ContextPermissions,
	ContextTask,
	DeadCodeKind,
	DeadCodePermissions,
	DeadCodeTask,
	Rulebook as ExternalRulebook,
	InstructionsProse,
	ReuseKind,
	ReusePermissions,
	ReuseTask,
	RulesKind,
	RulesPermissions,
	RulesTask,
	Surface,
} from "./contracts.g.ts";
import { Instructions, toRulebookSummaries } from "./instructions.ts";
import { nonnull } from "./nullish.ts";
import { surfaceOverview } from "./pagination.ts";
import { Rulebook } from "./rulebook.ts";

interface PersistedAudit {
	readonly name: Checkout;
	readonly document: AgentInstructions;
}

interface NamedProbe {
	readonly name: string;
	readonly probe: ProbeDocument;
	readonly auditDocument: AgentInstructions;
}

interface BundledProbes {
	readonly probes: readonly NamedProbe[];
	readonly rulesets: readonly ExternalRulebook[];
}

type ProbeDocument =
	| {
			readonly instructions?: InstructionsProse;
			readonly task?: RulesTask | ReuseTask | DeadCodeTask;
			readonly permissions?:
				| RulesPermissions
				| ReusePermissions
				| DeadCodePermissions;
			readonly kind: RulesKind | ReuseKind | DeadCodeKind;
			readonly change: Change;
			readonly surface: Surface;
			readonly rulebook: Rulebook;
			readonly checkout?: Checkout;
	  }
	| {
			readonly instructions?: InstructionsProse;
			readonly task?: ContextTask;
			readonly permissions?: ContextPermissions;
			readonly kind: ContextKind;
			readonly change: Change;
			readonly surface: Surface;
			readonly rulesets: readonly ExternalRulebook[];
			readonly checkout?: Checkout;
	  };

const toContextInstructions = (
	probe: Extract<ProbeDocument, { readonly kind: "context" }>,
	prose: AgentInstructions["instructions"],
	overview: AgentInstructions["surface"],
): AgentInstructions => {
	const spec = Instructions.forKind("context");
	return {
		instructions: prose,
		task: spec.task() as Extract<
			AgentInstructions,
			{ readonly kind: "context" }
		>["task"],
		permissions: spec.permissions() as Extract<
			AgentInstructions,
			{ readonly kind: "context" }
		>["permissions"],
		kind: "context",
		change: probe.change,
		surface: overview,
		rulesets: [...toRulebookSummaries(probe.rulesets)],
		checkout: nonnull(probe.checkout),
	};
};

const toRulebookInstructions = (
	probe: Exclude<ProbeDocument, { readonly kind: "context" }>,
	prose: AgentInstructions["instructions"],
	overview: AgentInstructions["surface"],
): AgentInstructions => {
	const spec = Instructions.forKind(probe.kind);
	const base = {
		instructions: prose,
		task: spec.task() as Extract<
			AgentInstructions,
			{ readonly kind: "rules" | "dead-code" | "reuse" }
		>["task"],
		permissions: spec.permissions() as Extract<
			AgentInstructions,
			{ readonly kind: "rules" | "dead-code" | "reuse" }
		>["permissions"],
		kind: probe.kind,
		change: probe.change,
		surface: overview,
		ruleset: probe.rulebook.toRuleset(),
	};
	if (probe.kind === "rules") {
		return base as AgentInstructions;
	}
	return { ...base, checkout: nonnull(probe.checkout) } as AgentInstructions;
};

const proseOf = (probe: ProbeDocument): InstructionsProse => {
	if (probe.instructions === undefined) {
		return Instructions.PROSE;
	}
	return probe.instructions;
};

const toAgentInstructions = (probe: ProbeDocument): AgentInstructions => {
	const prose = proseOf(probe);
	const overview = surfaceOverview(probe.surface);
	if (probe.kind === "context") {
		return toContextInstructions(probe, prose, overview);
	}
	return toRulebookInstructions(probe, prose, overview);
};

const fromAuditDocument = (
	document: AgentInstructions,
	surface: Surface,
	rulesets: readonly ExternalRulebook[],
): ProbeDocument => {
	if (document.kind === "context") {
		return {
			instructions: document.instructions,
			task: document.task,
			permissions: document.permissions,
			kind: document.kind,
			change: document.change,
			surface,
			rulesets,
			checkout: document.checkout,
		};
	}
	const parsedRulebook = nonnull(Rulebook.from(document.ruleset).data);
	if (document.kind === "rules") {
		return {
			instructions: document.instructions,
			task: document.task,
			permissions: document.permissions,
			kind: document.kind,
			change: document.change,
			surface,
			rulebook: parsedRulebook,
		};
	}
	return {
		instructions: document.instructions,
		task: document.task,
		permissions: document.permissions,
		kind: document.kind,
		change: document.change,
		surface,
		rulebook: parsedRulebook,
		checkout: document.checkout,
	};
};

const loadPersistedProbes = (
	audits: readonly PersistedAudit[],
	surface: Surface,
	rulesets: readonly ExternalRulebook[],
): readonly NamedProbe[] =>
	audits.map(({ name, document }) => ({
		name,
		probe: fromAuditDocument(document, surface, rulesets),
		auditDocument: document,
	}));

export type { BundledProbes, NamedProbe, PersistedAudit, ProbeDocument };
export { loadPersistedProbes, toAgentInstructions };
