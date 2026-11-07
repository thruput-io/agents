import { isNullOrEmpty } from "./domain/nullish.ts";

type Primitive = string | number | boolean | null | undefined;
export type JsonValue = Primitive | JsonValue[] | { [key: string]: JsonValue };

type SchemaKeyword =
	| "$defs"
	| "$ref"
	| "allOf"
	| "oneOf"
	| "anyOf"
	| "properties"
	| "required"
	| "not"
	| "kind"
	| "const"
	| "type"
	| "format"
	| "propertyNames"
	| "additionalProperties"
	| "__ref";

export type SchemaMap = Partial<Record<SchemaKeyword, JsonValue>> &
	Record<string, JsonValue>;

const SHARED_OBJECT_KEYS = ["type", "properties", "required"];
const BRANCH_KEYS = ["oneOf", "anyOf"];

export const isRecord = (value: JsonValue): value is SchemaMap =>
	typeof value === "object" && !isNullOrEmpty(value) && !Array.isArray(value);

export const asArray = (value: JsonValue): JsonValue[] =>
	Array.isArray(value) ? value : [];

const hasKeys = (record: SchemaMap): boolean => Object.keys(record).length > 0;

export const stripKeys = (
	record: SchemaMap,
	keys: readonly string[],
): SchemaMap =>
	Object.fromEntries(
		Object.entries(record).filter(([key]) => !keys.includes(key)),
	);

export const branchesOf = (record: SchemaMap): JsonValue[] | null =>
	Array.isArray(record.oneOf)
		? record.oneOf
		: Array.isArray(record.anyOf)
			? record.anyOf
			: null;

export function mergeTwo(base: SchemaMap, extra: SchemaMap): SchemaMap {
	const baseProperties = isRecord(base.properties) ? base.properties : {};
	const extraProperties = isRecord(extra.properties) ? extra.properties : {};
	const mergedProperties: SchemaMap = { ...baseProperties };
	for (const [key, value] of Object.entries(extraProperties)) {
		mergedProperties[key] =
			isRecord(baseProperties[key]) && isRecord(value)
				? mergeTwo(baseProperties[key], value)
				: value;
	}
	const requiredFields = [
		...new Set([...asArray(base.required), ...asArray(extra.required)]),
	];
	const combined: SchemaMap = {
		...stripKeys(base, BRANCH_KEYS),
		...stripKeys(extra, BRANCH_KEYS),
		...(hasKeys(mergedProperties) ? { properties: mergedProperties } : {}),
		...(requiredFields.length > 0 ? { required: requiredFields } : {}),
	};
	const baseBranches = branchesOf(base);
	const extraBranches = branchesOf(extra);
	if (!(baseBranches || extraBranches)) {
		return combined;
	}
	const rawBranches = (
		baseBranches && extraBranches
			? baseBranches.flatMap((leftBranch) =>
					extraBranches.map((rightBranch) =>
						isRecord(leftBranch) && isRecord(rightBranch)
							? mergeTwo(leftBranch, rightBranch)
							: rightBranch,
					),
				)
			: (baseBranches ?? extraBranches ?? [])
	).filter(isRecord);
	const sharedFields = Object.fromEntries(
		Object.entries(combined).filter(([key]) =>
			SHARED_OBJECT_KEYS.includes(key),
		),
	);
	const oneOf = hasKeys(sharedFields)
		? rawBranches.map((branch) => mergeTwo(sharedFields, branch))
		: rawBranches;
	return { ...stripKeys(combined, SHARED_OBJECT_KEYS), oneOf };
}
