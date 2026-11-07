import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { isNullOrEmpty } from "./domain/nullish.ts";
import {
	asArray,
	isRecord,
	type JsonValue,
	mergeTwo,
	type SchemaMap,
} from "./schema-merge.ts";

export interface SchemaSpec {
	readonly canonicalKey: string;
	readonly schemaName: string;
	readonly relativePath: string;
	readonly definition: JsonValue;
}

const BUNDLE_PREFIX = "#/$defs/https:~1~1thruput.se~1agents~1schemas~1";
const IGNORED_KEYS = new Set([
	"$defs",
	"$id",
	"$schema",
	"$dynamicAnchor",
	"examples",
]);
const PURE_REF_KEYS = new Set([...IGNORED_KEYS, "$ref", "description"]);
const PASCAL_CASE_PATTERN = /(?:^|[^a-zA-Z0-9]+)([a-zA-Z0-9])/gu;

const unescapePointer = (segment: string): string =>
	segment.replaceAll("~1", "/").replaceAll("~0", "~");

const getByPointer = (root: SchemaMap, reference: string): JsonValue =>
	reference
		.slice(2)
		.split("/")
		.reduce<JsonValue>(
			(current, part) =>
				isRecord(current) ? current[unescapePointer(part)] : undefined,
			root,
		);

const shouldDropEntry = (key: string, value: JsonValue): boolean =>
	IGNORED_KEYS.has(key) ||
	((key === "additionalProperties" || key === "unevaluatedProperties") &&
		value === false) ||
	(key === "$dynamicRef" && typeof value === "string" && value.startsWith("#"));

const toPascalCase = (raw: string): string =>
	raw.replace(PASCAL_CASE_PATTERN, (_, character: string) =>
		character.toUpperCase(),
	);

export const rootSchemaName = (relativePath: string): string =>
	relativePath.endsWith("agent-instructions.schema.json")
		? "AgentInstructionsBase"
		: `${toPascalCase(basename(relativePath, ".schema.json"))}${relativePath.includes("/instructions/") ? "Instructions" : ""}`;

const definitionName = (relativePath: string, name: string): string =>
	relativePath === "review/outcome.schema.json" && name === "Verdict"
		? "OutcomeVerdict"
		: name;

function canonicalReferenceKey(
	reference: string,
	relativePath: string,
): string {
	if (!reference.startsWith(BUNDLE_PREFIX)) {
		return reference.startsWith("#/$defs/")
			? `${relativePath}#${reference.slice(8)}`
			: "";
	}
	const [targetFile = "", definition] = reference
		.slice(BUNDLE_PREFIX.length)
		.split("/$defs/");
	const normalizedPath = targetFile.replaceAll("~1", "/");
	return isNullOrEmpty(definition)
		? normalizedPath
		: `${normalizedPath}#${definition}`;
}

const isPureReference = (node: SchemaMap): boolean =>
	typeof node.$ref === "string" &&
	Object.keys(node).every((key) => PURE_REF_KEYS.has(key));

export function loadSchemaBundle(bundleDirectory: string) {
	const relativePaths = readdirSync(bundleDirectory, { recursive: true })
		.map(String)
		.filter((name) => name.endsWith(".schema.json"))
		.sort((left, right) => left.localeCompare(right));
	const documents = new Map(
		relativePaths.map((relativePath) => [
			relativePath,
			JSON.parse(
				readFileSync(join(bundleDirectory, relativePath), "utf8"),
			) as SchemaMap,
		]),
	);
	const documentOf = (relativePath: string): SchemaMap =>
		documents.get(relativePath) ?? {};
	const definitionsOf = (document: SchemaMap): SchemaMap =>
		isRecord(document.$defs) ? document.$defs : {};
	const reviewPaths = relativePaths.filter((relativePath) =>
		relativePath.startsWith("review/"),
	);
	const specs: SchemaSpec[] = [
		...reviewPaths.flatMap((relativePath): SchemaSpec[] => [
			...Object.entries(definitionsOf(documentOf(relativePath)))
				.filter(([name]) => !name.startsWith("https://"))
				.map(
					([name, definition]): SchemaSpec => ({
						canonicalKey: `${relativePath}#${name}`,
						schemaName: definitionName(relativePath, name),
						relativePath,
						definition,
					}),
				),
			...(relativePath === "review/lines.schema.json"
				? []
				: [
						{
							canonicalKey: relativePath,
							schemaName: rootSchemaName(relativePath),
							relativePath,
							definition: documentOf(relativePath),
						},
					]),
		]),
		...(["rules", "principles", "definitions"] as const).map(
			(group): SchemaSpec => {
				const relativePath = `governance/${group}.schema.json`;
				const schemaName = toPascalCase(group.slice(0, -1));
				return {
					canonicalKey: `${relativePath}#${schemaName}`,
					schemaName,
					relativePath,
					definition: definitionsOf(documentOf(relativePath))[schemaName],
				};
			},
		),
	];
	const referenceMap = new Map(
		specs.map((spec) => [spec.canonicalKey, `${spec.schemaName}Schema`]),
	);
	const resolveNode = (
		node: JsonValue,
		root: SchemaMap,
		relativePath: string,
		isTopLevel = false,
	): JsonValue => {
		if (Array.isArray(node) || !isRecord(node)) {
			return Array.isArray(node)
				? node.map((item) => resolveNode(item, root, relativePath))
				: node;
		}
		const mappedReference =
			!isTopLevel && isPureReference(node)
				? referenceMap.get(
						canonicalReferenceKey(String(node.$ref), relativePath),
					)
				: null;
		if (!isNullOrEmpty(mappedReference)) {
			return { __ref: mappedReference };
		}
		const subschemas = [
			...(typeof node.$ref === "string" ? [getByPointer(root, node.$ref)] : []),
			...asArray(node.allOf),
		];
		const mergedBase = subschemas
			.map((subschema) => resolveNode(subschema, root, relativePath, true))
			.filter(isRecord)
			.reduce(mergeTwo, {});
		const ownEntries = Object.fromEntries(
			Object.entries(node)
				.filter(
					([key, value]) =>
						key !== "$ref" && key !== "allOf" && !shouldDropEntry(key, value),
				)
				.map(([key, value]) => [key, resolveNode(value, root, relativePath)]),
		);
		return mergeTwo(mergedBase, ownEntries);
	};
	return {
		specs,
		instructionPaths: reviewPaths.filter((relativePath) =>
			relativePath.includes("/instructions/"),
		),
		resolveSpec: (spec: SchemaSpec): JsonValue =>
			resolveNode(
				spec.definition,
				documentOf(spec.relativePath),
				spec.relativePath,
				true,
			),
	};
}
