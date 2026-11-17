import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
	type DefineSuccess,
	type Definition,
	DefinitionsSchema,
} from "./contracts.g.ts";
import { isNullOrEmpty, nonnull } from "./nullish.ts";

const CITATION = /\[\[(?<term>[^\]]+)\]\]/gu;
const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_DEFINITIONS_PATH = join(SKILL_DIR, "rules", "Definitions.yaml");

const extractTexts = (value: unknown): readonly string[] => {
	if (typeof value === "string") {
		return [value];
	}
	if (typeof value === "object" && !isNullOrEmpty(value)) {
		return Object.values(value).flatMap(extractTexts);
	}
	return [];
};

const referencedTerms = (entry: Definition): readonly string[] => [
	...new Set([
		...extractTexts(entry).flatMap((text) =>
			[...text.matchAll(CITATION)].map((match) => nonnull(match[1])),
		),
		...(entry.closedEnumerationOf ?? []),
		...(entry.openEnumerationOf ?? []),
	]),
];

export type DefineLookupResult =
	| { readonly success: true; readonly data: DefineSuccess }
	| { readonly success: false; readonly error: string };

export function resolveDefinition(
	term: string,
	depth: number,
	definitionsPath = DEFAULT_DEFINITIONS_PATH,
): DefineLookupResult {
	const { definitions } = DefinitionsSchema.parse(
		parse(readFileSync(definitionsPath, "utf8")),
	);
	const byId = new Map(definitions.map((entry) => [entry.id, entry]));
	const root =
		byId.get(term) ??
		definitions.find((entry) => entry.id.toLowerCase() === term.toLowerCase());
	if (isNullOrEmpty(root)) {
		return { success: false, error: `Unknown definition term: ${term}` };
	}
	const visited = new Map<string, Definition>([[root.id, root]]);
	let frontier: readonly Definition[] = [root];
	for (let level = 0; level < depth; level += 1) {
		const next: Definition[] = [];
		for (const current of frontier) {
			for (const refId of referencedTerms(current)) {
				const target = byId.get(refId);
				if (!(isNullOrEmpty(target) || visited.has(target.id))) {
					visited.set(target.id, target);
					next.push(target);
				}
			}
		}
		frontier = next;
	}
	return {
		success: true,
		data: {
			success: true,
			term: root.id,
			depth,
			definitions: [...visited.values()],
		},
	};
}
