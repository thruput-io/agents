import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dereference } from "@scalar/openapi-parser";
import {
	type JsonSchema,
	type JsonSchemaObject,
	jsonSchemaToZod,
	type ParserOverride,
	parseSchema,
	type Refs,
} from "json-schema-to-zod";
import { nonnull } from "../src/domain/nullish.ts";

interface SchemaDocument {
	readonly $defs?: Record<string, unknown>;
	readonly [key: string]: unknown;
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = resolve(SCRIPT_DIR, "../src/domain/contracts.g.ts");
const SCHEMAS_DIR = resolve(SCRIPT_DIR, "../../../schemas");
const PASCAL_CASE_PATTERN = /(?:^|[^a-zA-Z0-9]+)(?<char>[a-zA-Z0-9])/gu;
const DEREFERENCE_PASSES = 4;
const DEFAULT_DEADLINE_MS = 300_000;

const toPascalCase = (raw: string): string =>
	raw.replace(PASCAL_CASE_PATTERN, (_, character: string) =>
		character.toUpperCase(),
	);

const rootSchemaName = (relativePath: string): string =>
	toPascalCase(basename(relativePath, ".schema.json"));

const customOverride: ParserOverride = (
	schemaObject: JsonSchemaObject,
	refs: Refs,
) => {
	if (Array.isArray(schemaObject.const)) {
		const tuple = `z.tuple([${schemaObject.const.map((item) => `z.literal(${JSON.stringify(item)})`).join(", ")}])`;
		return `${tuple}.default(${JSON.stringify(schemaObject.const)})`;
	}
	if (
		(typeof schemaObject.const === "string" &&
			schemaObject.const.includes(" ")) ||
		schemaObject.const === DEFAULT_DEADLINE_MS
	) {
		const literal = JSON.stringify(schemaObject.const);
		return `z.literal(${literal}).default(${literal})`;
	}
	if (!Array.isArray(schemaObject.oneOf)) {
		return;
	}
	return `z.xor([${schemaObject.oneOf.map((branch) => parseSchema(branch as JsonSchema, refs)).join(", ")}])`;
};

const toZod = (schema: unknown): string =>
	jsonSchemaToZod(schema as JsonSchema, {
		zodVersion: 4,
		withoutDescribes: false,
		parserOverride: customOverride,
	});

const allFiles = readdirSync(SCHEMAS_DIR, { recursive: true })
	.map(String)
	.filter(
		(name) => name.endsWith(".schema.json") && !name.endsWith(".g.schema.json"),
	)
	.sort((left, right) => left.localeCompare(right))
	.map((name) => join(SCHEMAS_DIR, name));

const rawByPath = new Map<string, SchemaDocument>(
	allFiles.map((filePath) => [
		filePath,
		JSON.parse(readFileSync(filePath, "utf8")) as SchemaDocument,
	]),
);
const resolvedByPath = new Map<string, SchemaDocument>(rawByPath);

const specFor = (
	filePath: string,
	target: string,
	resolvedMap: ReadonlyMap<string, SchemaDocument>,
): SchemaDocument => {
	if (filePath === target) {
		return nonnull(rawByPath.get(filePath));
	}
	return nonnull(resolvedMap.get(filePath));
};

const runDereferencePass = async (
	pass: number,
	resolvedMap: Map<string, SchemaDocument>,
): Promise<void> => {
	if (pass >= DEREFERENCE_PASSES) {
		return;
	}
	const results = await Promise.all(
		allFiles.map(async (target) => {
			const baseDir = dirname(target);
			const filesystem = allFiles.map((filePath) => ({
				isEntrypoint: filePath === target,
				filename: relative(baseDir, filePath).replaceAll("\\", "/"),
				dir: dirname(filePath),
				references: [] as string[],
				specification: structuredClone(specFor(filePath, target, resolvedMap)),
			}));
			const { schema, errors } = await dereference(filesystem);
			return { target, schema, errors };
		}),
	);
	for (const { target, schema, errors } of results) {
		const hasErrors = errors !== undefined && errors.length > 0;
		if (!hasErrors && schema !== undefined) {
			resolvedMap.set(target, schema as SchemaDocument);
		} else if (pass === DEREFERENCE_PASSES - 1) {
			throw new Error(
				`Failed to dereference ${target}: ${JSON.stringify(errors)}`,
			);
		}
	}
	await runDereferencePass(pass + 1, resolvedMap);
};

await runDereferencePass(0, resolvedByPath);

const reviewPaths = readdirSync(join(SCHEMAS_DIR, "review"), {
	recursive: true,
})
	.map(String)
	.filter((name) => name.endsWith(".schema.json"))
	.sort((left, right) => left.localeCompare(right))
	.map((name) => `review/${name}`);

const declarations: string[] = ["import { z } from 'zod';"];

const emitSchema = (name: string, definition: unknown): void => {
	declarations.push(
		`export const ${name}Schema = ${toZod(definition)};\nexport type ${name} = z.infer<typeof ${name}Schema>;`,
	);
};

for (const relativePath of reviewPaths) {
	const document = nonnull(resolvedByPath.get(join(SCHEMAS_DIR, relativePath)));
	const defs = document.$defs;
	if (defs !== undefined) {
		for (const [defName, defSchema] of Object.entries(defs)) {
			emitSchema(defName, defSchema);
		}
	}
	const rootName = rootSchemaName(relativePath);
	if (defs === undefined || !Object.hasOwn(defs, rootName)) {
		emitSchema(rootName, document);
	}
}

for (const group of ["rules", "principles", "definitions"] as const) {
	const document = nonnull(
		resolvedByPath.get(join(SCHEMAS_DIR, `governance/${group}.schema.json`)),
	);
	const defs = nonnull(document.$defs);
	const itemName = toPascalCase(group.slice(0, -1));
	emitSchema(itemName, defs[itemName]);
	emitSchema(toPascalCase(group), document);
}

writeFileSync(OUTPUT_FILE, `${declarations.join("\n")}\n`, "utf8");
