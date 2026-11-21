import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import {
	type Definition,
	DefinitionsSchema,
} from "../../domain/contracts.g.ts";
import { isNullOrEmpty, nonnull } from "../../domain/nullish.ts";
import type { DefineLookupResult } from "../../domain/ports.ts";
import { SKILL_DIR } from "./skill-dir.ts";

const CITATION = /\[\[(?<term>[^\]]+)\]\]/gu;
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

const definedItems = (
	items: readonly string[] | undefined,
): readonly string[] => {
	if (items === undefined) {
		return [];
	}
	return items;
};

const referencedTerms = (entry: Definition): readonly string[] => [
	...new Set([
		...extractTexts(entry).flatMap((text) =>
			[...text.matchAll(CITATION)].map((match) => nonnull(match[1])),
		),
		...definedItems(entry.closedEnumerationOf),
		...definedItems(entry.openEnumerationOf),
	]),
];

function resolveDefinition(term: string, depth: number): DefineLookupResult {
	return resolveDefinitionFromPath(term, depth, DEFAULT_DEFINITIONS_PATH);
}

function resolveDefinitionFromPath(
	term: string,
	depth: number,
	definitionsPath: string,
): DefineLookupResult {
	const { definitions } = DefinitionsSchema.parse(
		parse(readFileSync(definitionsPath, "utf8")),
	);
	const byId = new Map(definitions.map((entry) => [entry.id, entry]));
	let root = byId.get(term);
	if (root === undefined) {
		root = definitions.find(
			(entry) => entry.id.toLowerCase() === term.toLowerCase(),
		);
	}
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

export { resolveDefinition };
