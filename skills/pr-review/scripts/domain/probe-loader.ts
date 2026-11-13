import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type { z } from "zod";
import {
	type AgentInstructions,
	type Change,
	type Checkout,
	DefinitionsSchema,
	type Rulebook as ExternalRulebook,
	PrinciplesSchema,
	RulesSchema,
	type Surface,
} from "./contracts.g.ts";
import { Instructions, instructions } from "./instructions.ts";
import { nonnull } from "./nullish.ts";
import {
	checkKinds,
	kindOf,
	partition,
	Rulebook,
	rulebook,
} from "./rulebook.ts";
import { FILE_TOO_LARGE, IndexSchema, withText } from "./ruleset.ts";
import type { ProbeDocument } from "./sub-agent-controller.ts";
import type { PersistedAudit } from "./workdir.ts";

export interface NamedProbe {
	readonly name: string;
	readonly probe: ProbeDocument;
	readonly auditDocument: AgentInstructions;
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
	const { definitions } = parseYaml("Definitions.yaml", DefinitionsSchema);
	const groups = partition(rules.filter((rule) => rule.id !== FILE_TOO_LARGE));
	checkKinds(groups.map((group) => group.group));
	return groups.map((group) => ({
		name: group.name,
		kind: kindOf(group.group),
		rulebook: nonnull(
			Rulebook.from(rulebook(group.rules, { principles, definitions })).data,
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

export const toAgentInstructions = (
	probe: ProbeDocument,
): AgentInstructions => {
	const prose = probe.instructions ?? Instructions.Prose;
	if (probe.kind === "context") {
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
			surface: probe.surface,
			rulesets: [...probe.rulesets],
		};
	}
	if (probe.kind === "rules") {
		const spec = Instructions.forKind("rules");
		return {
			instructions: prose,
			task: spec.task() as Extract<
				AgentInstructions,
				{ readonly kind: "rules" }
			>["task"],
			permissions: spec.permissions() as Extract<
				AgentInstructions,
				{ readonly kind: "rules" }
			>["permissions"],
			kind: "rules",
			change: probe.change,
			surface: probe.surface,
			ruleset: probe.rulebook.toRuleset(),
		};
	}
	if (probe.kind === "dead-code") {
		const spec = Instructions.forKind("dead-code");
		return {
			instructions: prose,
			task: spec.task() as Extract<
				AgentInstructions,
				{ readonly kind: "dead-code" }
			>["task"],
			permissions: spec.permissions() as Extract<
				AgentInstructions,
				{ readonly kind: "dead-code" }
			>["permissions"],
			kind: "dead-code",
			change: probe.change,
			surface: probe.surface,
			ruleset: probe.rulebook.toRuleset(),
			checkout: nonnull(probe.checkout),
		};
	}
	const spec = Instructions.forKind("reuse");
	return {
		instructions: prose,
		task: spec.task() as Extract<
			AgentInstructions,
			{ readonly kind: "reuse" }
		>["task"],
		permissions: spec.permissions() as Extract<
			AgentInstructions,
			{ readonly kind: "reuse" }
		>["permissions"],
		kind: "reuse",
		change: probe.change,
		surface: probe.surface,
		ruleset: probe.rulebook.toRuleset(),
		checkout: nonnull(probe.checkout),
	};
};

export async function loadBundledProbes(
	change: Change,
	surface: Surface,
	checkout: Checkout,
): Promise<readonly NamedProbe[]> {
	const groups = loadBundledRuleGroups();
	const rulesets = await loadBundledRulesets();
	const built = instructions({ change, surface, checkout }, groups, rulesets);
	return built.map((entry) => {
		const probe = entry.document as ProbeDocument;
		return {
			name: entry.name,
			probe,
			auditDocument: toAgentInstructions(probe),
		};
	});
}

const fromAuditDocument = (document: AgentInstructions): ProbeDocument => {
	if (document.kind === "context") {
		return {
			instructions: document.instructions,
			task: document.task,
			permissions: document.permissions,
			kind: document.kind,
			change: document.change,
			surface: document.surface,
			rulesets: document.rulesets,
		};
	}
	return {
		instructions: document.instructions,
		task: document.task,
		permissions: document.permissions,
		kind: document.kind,
		change: document.change,
		surface: document.surface,
		rulebook: nonnull(Rulebook.from(document.ruleset).data),
		...(document.kind === "rules" ? {} : { checkout: document.checkout }),
	};
};

export function loadPersistedProbes(
	audits: readonly PersistedAudit[],
): readonly NamedProbe[] {
	return audits.map(({ name, document }) => ({
		name,
		probe: fromAuditDocument(document),
		auditDocument: document,
	}));
}
