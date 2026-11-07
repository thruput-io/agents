import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type JsonSchema,
	type JsonSchemaObject,
	jsonSchemaToZod,
	parseSchema,
	type Refs,
} from "json-schema-to-zod";
import { isNullOrEmpty, nonEmptyString } from "./domain/nullish.ts";
import {
	loadSchemaBundle,
	rootSchemaName,
	type SchemaSpec,
} from "./schema-bundle.ts";
import {
	branchesOf,
	isRecord,
	type JsonValue,
	type SchemaMap,
	stripKeys,
} from "./schema-merge.ts";

const OUTPUT_FILE = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"domain/contracts.g.ts",
);
const { PROJECT_ROOT } = process.env;
const BUNDLE_DIRECTORY = join(nonEmptyString(PROJECT_ROOT), "build/schemas");
const NO_DEFAULT_PATTERN = /(?:Kind|Verdict)$/u;
const SCHEMA_REFERENCE_PATTERN = /\b(\w+)Schema\b/gu;

const parseSubschema = (subschema: JsonValue, refs: Refs): string =>
	parseSchema(subschema as JsonSchema, refs);

const toLiteral = (value: JsonValue): string =>
	`z.literal(${JSON.stringify(value)})`;

const customOverride =
	(schemaName: string) => (schemaObject: JsonSchemaObject, refs: Refs) => {
		const schemaMap = schemaObject as SchemaMap;
		const branches = branchesOf(schemaMap);
		if (typeof schemaMap.__ref === "string") {
			return schemaMap.__ref;
		}
		if (!isNullOrEmpty(schemaMap.const)) {
			const baseExpression = Array.isArray(schemaMap.const)
				? `z.tuple([${schemaMap.const.map(toLiteral).join(", ")}])`
				: toLiteral(schemaMap.const);
			return NO_DEFAULT_PATTERN.test(schemaName) ||
				["kind", "verdict"].includes(String(refs.path.at(-1)))
				? baseExpression
				: `${baseExpression}.default(${JSON.stringify(schemaMap.const)})`;
		}
		if (!isNullOrEmpty(branches)) {
			return `z.xor([${branches.map((branch) => parseSubschema(branch, refs)).join(", ")}])`;
		}
		if (
			isRecord(schemaMap.propertyNames) &&
			isRecord(schemaMap.additionalProperties)
		) {
			return `z.record(${parseSubschema(schemaMap.propertyNames, refs)}, ${parseSubschema(schemaMap.additionalProperties, refs)}).refine((record) => { const keys = Object.keys(record).map(Number).sort((left, right) => left - right); return keys.length >= 1 && keys.every((lineNumber, index) => index === 0 || lineNumber === (keys[index - 1] as number) + 1) && Object.values(record).every((lineText) => !lineText.includes('\\n') && !lineText.includes('\\r')); }, 'Expected consecutive single-line entries')`;
		}
		if (isRecord(schemaMap.not) && Array.isArray(schemaMap.not.required)) {
			const requiredChecks = schemaMap.not.required.map(
				(field) => `record.${String(field)} !== undefined`,
			);
			return `${parseSubschema(stripKeys(schemaMap, ["not"]), refs)}.refine((record) => !(${requiredChecks.join(" && ")}), 'Mutually exclusive fields')`;
		}
		if (
			isRecord(schemaMap.properties) &&
			"start" in schemaMap.properties &&
			!("__range" in schemaMap)
		) {
			return `${parseSubschema({ ...schemaMap, __range: true }, refs)}.refine((range) => range.end >= range.start, 'Expected start <= end')`;
		}
		return schemaMap.type === "string" && schemaMap.format === "uri"
			? "z.url().refine((url) => url.startsWith('https://') || url.startsWith('http://'), 'Expected http(s) URL')"
			: undefined;
	};

const { specs, instructionPaths, resolveSpec } =
	loadSchemaBundle(BUNDLE_DIRECTORY);

const toZodExpression = (spec: SchemaSpec): string =>
	jsonSchemaToZod(resolveSpec(spec) as JsonSchema, {
		zodVersion: 4,
		withoutDescribes: true,
		parserOverride: customOverride(spec.schemaName),
	});

const expressionsByName = new Map(
	specs.map((spec) => [spec.schemaName, toZodExpression(spec)]),
);
const visitedNames = new Set<string>();
const orderedNames: string[] = [];

const visitSchema = (schemaName: string): void => {
	if (visitedNames.has(schemaName) || !expressionsByName.has(schemaName)) {
		return;
	}
	visitedNames.add(schemaName);
	const expression = expressionsByName.get(schemaName) ?? "";
	for (const [, dependencyName = ""] of expression.matchAll(
		SCHEMA_REFERENCE_PATTERN,
	)) {
		visitSchema(dependencyName);
	}
	orderedNames.push(schemaName);
};

for (const schemaName of expressionsByName.keys()) {
	visitSchema(schemaName);
}

const instructionSchemas = instructionPaths.map(
	(relativePath) => `${rootSchemaName(relativePath)}Schema`,
);

const outputLines = [
	"import { z } from 'zod';",
	...orderedNames.map(
		(schemaName) =>
			`export const ${schemaName}Schema = ${expressionsByName.get(schemaName)};\nexport type ${schemaName} = z.infer<typeof ${schemaName}Schema>;`,
	),
	`export const AgentInstructionsSchema = z.xor([${instructionSchemas.join(", ")}]);`,
	"export type AgentInstructions = z.infer<typeof AgentInstructionsSchema>;",
	'export const RULEBOOK_PROBE_KINDS: ReadonlySet<string> = new Set(["dead-code","reuse"]);\n',
];

writeFileSync(OUTPUT_FILE, outputLines.join("\n"), "utf8");
