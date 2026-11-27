import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const text = z.string().min(1);
const PROBE_NAME = /^[a-z]+(?:-[a-z]+)*$/u;

const RulesShape = z.object({
	rules: z.array(z.object({ id: text, group: text, body: text })),
});
const PrinciplesShape = z.object({
	principles: z.array(z.object({ id: text, body: text })),
});
const DefinitionsShape = z.object({
	definitions: z.array(z.object({ id: text, specification: text })),
});

type Rules = z.infer<typeof RulesShape>["rules"];
type Principles = z.infer<typeof PrinciplesShape>["principles"];
type Definitions = z.infer<typeof DefinitionsShape>["definitions"];

interface Assigned {
	readonly acknowledgementRequest: string;
	readonly probes: readonly { readonly name: string; readonly group: string }[];
}

interface Rulebook {
	readonly acknowledgementRequest: string;
	readonly probes: readonly {
		readonly name: string;
		readonly rules: readonly string[];
	}[];
	readonly glossary: readonly (readonly string[])[];
}

const moduleOf = (rulebook: Rulebook): string =>
	[
		"interface Rulebook {",
		"\treadonly acknowledgementRequest: string;",
		"\treadonly probes: readonly { readonly name: string; readonly rules: readonly string[] }[];",
		"\treadonly glossary: readonly (readonly [string, string])[];",
		"}",
		"",
		`export const rulebook: Rulebook = ${JSON.stringify(rulebook, undefined, "\t")};`,
		"",
	].join("\n");

const rulesIn = (rulesFolder: string): Rules =>
	RulesShape.parse(
		parse(readFileSync(resolve(rulesFolder, "Rules.yaml"), "utf8")),
	).rules;

const principlesIn = (rulesFolder: string): Principles =>
	PrinciplesShape.parse(
		parse(readFileSync(resolve(rulesFolder, "Principles.yaml"), "utf8")),
	).principles;

const definitionsIn = (rulesFolder: string): Definitions =>
	DefinitionsShape.parse(
		parse(readFileSync(resolve(rulesFolder, "Definitions.yaml"), "utf8")),
	).definitions;

const assignedIn = (probesFile: string, rules: Rules): Assigned =>
	z
		.strictObject({
			acknowledgementRequest: text,
			probes: z.array(
				z.strictObject({
					name: z.string().regex(PROBE_NAME),
					group: text.refine((group: string): boolean =>
						rules.some((rule): boolean => rule.group === group),
					),
				}),
			),
		})
		.parse(parse(readFileSync(probesFile, "utf8")));

const glossaryOf = (
	rulesFolder: string,
	rules: Rules,
): readonly (readonly string[])[] => [
	...definitionsIn(rulesFolder).map(({ id, specification }) => [
		id,
		specification.trim(),
	]),
	...principlesIn(rulesFolder).map(({ id, body }) => [id, body.trim()]),
	...rules.map(({ id, body }) => [id, body.trim()]),
];

const rulebookModule = (rulesFolder: string, probesFile: string): string => {
	const rules = rulesIn(rulesFolder);
	const { probes, acknowledgementRequest } = assignedIn(probesFile, rules);

	return moduleOf({
		acknowledgementRequest,
		probes: probes.map(({ name, group }) => ({
			name,
			rules: rules
				.filter((rule): boolean => rule.group === group)
				.map((rule): string => rule.id),
		})),
		glossary: glossaryOf(rulesFolder, rules),
	});
};

export { rulebookModule };
