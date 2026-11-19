import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { z } from "zod";
import {
	type Change,
	type Checkout,
	type Rulebook as ExternalRulebook,
	PrinciplesSchema,
	RulesSchema,
	type SessionToken,
	type Surface,
} from "../../domain/contracts.g.ts";
import { instructionsForSession } from "../../domain/instructions.ts";
import { nonnull } from "../../domain/nullish.ts";
import {
	type BundledProbes,
	type ProbeDocument,
	toAgentInstructions,
} from "../../domain/probe-document.ts";
import {
	checkKinds,
	kindOf,
	partition,
	Rulebook,
	rulebook,
} from "../../domain/rulebook.ts";
import { IndexSchema, withText } from "../../domain/ruleset.ts";
import { PROBE_BIN_PATH, SKILL_DIR } from "./skill-dir.ts";

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
	session: SessionToken,
): Promise<BundledProbes> {
	const groups = loadBundledRuleGroups();
	const rulesets = await loadBundledRulesets();
	const built = instructionsForSession(
		{ change, surface, checkout, probeBin: PROBE_BIN_PATH, session },
		groups,
		rulesets,
	);
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

export { loadBundledProbes };
