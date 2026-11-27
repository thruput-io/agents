import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const text = z.string().min(1);
const PROBE_NAME = /^[a-z]+(?:-[a-z]+)*$/u;

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

const rulebookModule = (rulesFolder: string, probesFile: string): string => {
	const { rules } = z
		.object({ rules: z.array(z.object({ id: text, group: text, body: text })) })
		.parse(parse(readFileSync(resolve(rulesFolder, "Rules.yaml"), "utf8")));

	const { principles } = z
		.object({ principles: z.array(z.object({ id: text, body: text })) })
		.parse(
			parse(readFileSync(resolve(rulesFolder, "Principles.yaml"), "utf8")),
		);

	const { definitions } = z
		.object({
			definitions: z.array(z.object({ id: text, specification: text })),
		})
		.parse(
			parse(readFileSync(resolve(rulesFolder, "Definitions.yaml"), "utf8")),
		);

	const { probes, acknowledgementRequest } = z
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

	const rulebook: Rulebook = {
		acknowledgementRequest,
		probes: probes.map(({ name, group }) => ({
			name,
			rules: rules
				.filter((rule): boolean => rule.group === group)
				.map((rule): string => rule.id),
		})),
		glossary: [
			...definitions.map(({ id, specification }) => [id, specification.trim()]),
			...principles.map(({ id, body }) => [id, body.trim()]),
			...rules.map(({ id, body }) => [id, body.trim()]),
		],
	};

	return moduleOf(rulebook);
};

export { rulebookModule };
