import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type { z } from "zod";
import {
	type AgentInstructions,
	type Change,
	type Checkout,
	type Rulebook as ExternalRulebook,
	PrinciplesSchema,
	RulesSchema,
	type Surface,
} from "./contracts.g.ts";
import {
	Instructions,
	instructions,
	toRulebookSummaries,
} from "./instructions.ts";
import { nonnull } from "./nullish.ts";
import { surfaceOverview } from "./pagination.ts";
import {
	checkKinds,
	kindOf,
	partition,
	Rulebook,
	rulebook,
} from "./rulebook.ts";
import { IndexSchema, withText } from "./ruleset.ts";
import type { ProbeDocument } from "./sub-agent-controller.ts";
import type { PersistedAudit } from "./workdir.ts";

interface NamedProbe {
	readonly name: string;
	readonly probe: ProbeDocument;
	readonly auditDocument: AgentInstructions;
}

interface BundledProbes {
	readonly probes: readonly NamedProbe[];
	readonly rulesets: readonly ExternalRulebook[];
}

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const parseYaml = <T>(name: string, schema: z.ZodType<T>): T =>
	schema.parse(parse(readFileSync(join(SKILL_DIR, "rules", name), "utf8")));

function loadBundledRuleGroups(): readonly {
	readonly name: string;
	readonly kind: "rules" | "reuse" | "dead-code";
	readonly rulebook: Rulebook;
}[] {
	const { rules } = parseYaml("Rules.yaml", RulesSchema);
	const { principles } = parseYaml("Principles.yaml", PrinciplesSchema);
	const groups = partition(rules);
	checkKinds(groups.map((group) => group.group));
	return groups.map((group) => ({
		name: group.name,
		kind: kindOf(group.group),
		rulebook: nonnull(
			Rulebook.from(rulebook(group.rules, { principles })).data,
		),
	}));
}

function loadBundledRulesets(): Promise<readonly ExternalRulebook[]> {
	const indexFile = join(
		SKILL_DIR,
		"references",
		"agent-rules-books-search-index.json",
	);
	const entries = IndexSchema.parse(
		JSON.parse(readFileSync(indexFile, "utf8")),
	);
	return Promise.all(
		entries.map(async (entry) => {
			const response = await fetch(entry.rawUrl);
			if (!response.ok) {
				throw new Error(
					`the ruleset ${entry.url} could not be read: HTTP ${response.status}`,
				);
			}
			return withText(entry, await response.text());
		}),
	);
}

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

const toAgentInstructions = (probe: ProbeDocument): AgentInstructions => {
	const prose = probe.instructions ?? Instructions.PROSE;
	const overview = surfaceOverview(probe.surface);
	if (probe.kind === "context") {
		return toContextInstructions(probe, prose, overview);
	}
	return toRulebookInstructions(probe, prose, overview);
};

const BUNDLED_EXTRA_BY_KIND: Record<
	ProbeDocument["kind"],
	(rulesets: readonly ExternalRulebook[]) => {
		readonly rulesets?: readonly ExternalRulebook[];
	}
> = {
	context: (rulesets) => ({ rulesets }),
	rules: () => ({}),
	"dead-code": () => ({}),
	reuse: () => ({}),
};

async function loadBundledProbes(
	change: Change,
	surface: Surface,
	checkout: Checkout,
): Promise<BundledProbes> {
	const groups = loadBundledRuleGroups();
	const rulesets = await loadBundledRulesets();
	const built = instructions({ change, surface, checkout }, groups, rulesets);
	const probes = built.map((entry) => {
		const raw = entry.document as unknown as ProbeDocument;
		const probe: ProbeDocument = {
			...raw,
			surface,
			...BUNDLED_EXTRA_BY_KIND[raw.kind](rulesets),
		};
		return {
			name: entry.name,
			probe,
			auditDocument: toAgentInstructions(probe),
		};
	});
	return { probes, rulesets };
}

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

function loadPersistedProbes(
	audits: readonly PersistedAudit[],
	surface: Surface,
	rulesets: readonly ExternalRulebook[],
): readonly NamedProbe[] {
	return audits.map(({ name, document }) => ({
		name,
		probe: fromAuditDocument(document, surface, rulesets),
		auditDocument: document,
	}));
}

export type { NamedProbe };
export { loadBundledProbes, loadPersistedProbes, toAgentInstructions };
