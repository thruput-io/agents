import { z } from "zod";
import {
	type BookRule,
	type DeadCodeKind,
	type Definition,
	DefinitionSchema,
	type Observation,
	type Principle,
	PrincipleSchema,
	type ReuseKind,
	type Rule,
	type Ruleset as RulebookData,
	RuleSchema,
	type RulesetInstructions,
	RulesetInstructionsSchema,
	RulesetSchema,
	type RulesetUrl,
	type RulesKind,
	type ThreadBody,
} from "./contracts.g.ts";
import { isNullOrEmpty } from "./nullish.ts";

export const SITE = "https://thruput.se/agents/";
const APOSTROPHE = /'/gu;
const NON_ALPHANUMERIC = /[^a-z0-9]+/gu;
const EDGE_HYPHEN = /^-|-$/gu;
const RENDERED = / breaks \[[^\]]+\]\([^)]+\)/u;

export const slug = (id: string): string =>
	id
		.toLowerCase()
		.replace(APOSTROPHE, "")
		.replace(NON_ALPHANUMERIC, "-")
		.replace(EDGE_HYPHEN, "");

export const ours = (text: string): boolean =>
	RENDERED.test(text) || text.includes(SITE);

export const message = (
	violation: { readonly observation: Observation },
	cite: string,
): ThreadBody => `${violation.observation} breaks ${cite}`;

export interface CitationRule {
	readonly id: Rule["id"];
	readonly parent: Principle["id"];
}

export type CitationDocument =
	| { readonly rulebook: { readonly rules: readonly CitationRule[] } }
	| { readonly rulesets: readonly { readonly url: RulesetUrl }[] };

type CitationRow =
	| { readonly rule: Rule["id"] }
	| { readonly bookRule: BookRule };

export function citation(document: CitationDocument, row: CitationRow): string {
	if ("bookRule" in row) {
		return `[${row.bookRule.heading}](${row.bookRule.ruleset})`;
	}
	if (!("rulebook" in document)) {
		throw new Error(
			`rule ${row.rule} cited against a document without a rulebook`,
		);
	}
	const rule = document.rulebook.rules.find((entry) => entry.id === row.rule);
	if (isNullOrEmpty(rule)) {
		throw new Error(`rule ${row.rule} has no entry in the probe rulebook`);
	}
	return `[${rule.parent}](${SITE}#${slug(rule.parent)})`;
}

export function partition<T extends { readonly group: Rule["group"] }>(
	rules: readonly T[],
): { name: string; group: Rule["group"]; rules: readonly T[] }[] {
	const groups = new Map<Rule["group"], readonly T[]>();
	for (const rule of rules) {
		groups.set(rule.group, [...(groups.get(rule.group) ?? []), rule]);
	}
	return [...groups].map(([group, members]) => ({
		name: slug(group),
		group,
		rules: members,
	}));
}

const KIND_OF_GROUP = new Map<Rule["group"], ReuseKind | DeadCodeKind>([
	["Reuse", "reuse"],
	["Dead Code", "dead-code"],
]);

export const kindOf = (
	group: Rule["group"],
): ReuseKind | DeadCodeKind | RulesKind => KIND_OF_GROUP.get(group) ?? "rules";

export function checkKinds(groups: readonly Rule["group"][]): void {
	const absent = [...KIND_OF_GROUP.keys()].filter(
		(group) => !groups.includes(group),
	);
	if (absent.length > 0) {
		throw new Error(
			`no rule is in the group ${absent.join(", ")}, which a kind of probe is tied to: the group was renamed or removed`,
		);
	}
}

const GovernanceSchema = z.object({
	principles: z.array(PrincipleSchema).readonly(),
	definitions: z.array(DefinitionSchema).readonly(),
});

export function rulebook(
	rules: readonly Rule[],
	governance: z.input<typeof GovernanceSchema>,
): RulebookData {
	const parsedRules = z.array(RuleSchema).decode([...rules]);
	const parsedGovernance = GovernanceSchema.decode(governance);
	const uniqueParents = [...new Set(parsedRules.map((child) => child.parent))];
	const principles = uniqueParents.map((id) => {
		const parent = parsedGovernance.principles.find((entry) => entry.id === id);
		if (isNullOrEmpty(parent)) {
			throw new Error(
				`the principle ${id} is named as a parent and is not declared`,
			);
		}
		return parent;
	});
	return {
		instructions: RulesetInstructionsSchema.decode(undefined),
		rules: parsedRules,
		principles,
		definitions: [...parsedGovernance.definitions],
	};
}

export class Rulebook implements Iterable<Rule> {
	readonly #data: RulebookData;
	private constructor(data: RulebookData) {
		this.#data = data;
	}
	static readonly Schema = z.codec(
		RulesetSchema,
		z.custom<Rulebook>((val): val is Rulebook => val instanceof Rulebook),
		{
			decode: (data) => new Rulebook(data),
			encode: (book) => book.toRuleset(),
		},
	);
	static from(raw: z.input<typeof RulesetSchema>) {
		return Rulebook.Schema.safeDecode(raw);
	}
	static slice(
		rules: readonly Rule[],
		governance: {
			readonly principles: readonly Principle[];
			readonly definitions: readonly Definition[];
		},
	): z.ZodSafeParseResult<Rulebook> {
		return Rulebook.from(rulebook(rules, governance));
	}
	get instructions(): RulesetInstructions {
		return this.#data.instructions;
	}
	get rules(): readonly Rule[] {
		return this.#data.rules;
	}
	toRuleset(): RulebookData {
		return this.#data;
	}
	[Symbol.iterator](): Iterator<Rule> {
		return this.#data.rules[Symbol.iterator]();
	}
}
