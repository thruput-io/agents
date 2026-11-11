import { readFileSync, writeFileSync } from "node:fs";
import { upgrade } from "@scalar/openapi-parser";
import { generate } from "orval";

type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

const UTF8_BOM = /^\uFEFF/u;
const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

const ZOD_OPTIONS = {
	version: 4,
	exactOptional: true,
	generateCompanionTypes: true,
	generate: {
		param: false,
		query: false,
		header: false,
		body: true,
		response: true,
	},
} as const;

const isRecord = (
	value: JsonValue | undefined,
): value is { [key: string]: JsonValue } =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const wrapAzureArrayResponse = (value: {
	[key: string]: JsonValue;
}): { [key: string]: JsonValue } => {
	const { schema } = value;
	if (!isRecord(schema)) {
		return value;
	}
	const { type } = schema;
	if (type !== "array") {
		return value;
	}
	return {
		...value,
		schema: {
			type: "object",
			required: ["value"],
			properties: {
				count: { type: "integer", format: "int32" },
				value: schema,
			},
		},
	};
};

const markOptionalNullable = (value: {
	[key: string]: JsonValue;
}): { [key: string]: JsonValue } => {
	const { properties, required } = value;
	if (!isRecord(properties)) {
		return value;
	}
	const requiredSet = new Set(Array.isArray(required) ? required : []);
	const updated = Object.fromEntries(
		Object.entries(properties).map(([propKey, propVal]) => [
			propKey,
			!requiredSet.has(propKey) && isRecord(propVal)
				? { ...propVal, "x-nullable": true }
				: propVal,
		]),
	);
	return { ...value, properties: updated };
};

const normalizeOperationResponses = (spec: {
	[key: string]: JsonValue;
}): void => {
	const { paths } = spec;
	if (!isRecord(paths)) {
		return;
	}
	for (const pathItem of Object.values(paths)) {
		if (!isRecord(pathItem)) {
			continue;
		}
		for (const [method, operation] of Object.entries(pathItem)) {
			if (!(HTTP_METHODS.has(method) && isRecord(operation))) {
				continue;
			}
			const { responses } = operation;
			if (!isRecord(responses)) {
				continue;
			}
			const okResponses = Object.fromEntries(
				Object.entries(responses).filter(([status]) => status.startsWith("2")),
			);
			const defaultResponse =
				method === "get" || method === "patch"
					? {
							default: {
								description: "Non-JSON or error response",
								content: { "text/html": { schema: { type: "string" } } },
							},
						}
					: {};
			Object.assign(operation, {
				responses: { ...okResponses, ...defaultResponse },
			});
		}
	}
};

const prepareSpec = (
	source: string,
	generated: string,
	azureTransforms: boolean,
): string => {
	const raw = readFileSync(source, "utf8").replace(UTF8_BOM, "");
	const cleaned = JSON.parse(raw, (key, value: JsonValue) => {
		if (key === "x-ms-examples" || !isRecord(value)) {
			return key === "x-ms-examples" ? undefined : value;
		}
		const withoutDefault: Record<string, JsonValue> =
			"type" in value && "default" in value
				? Object.fromEntries(
						Object.entries(value).filter(([prop]) => prop !== "default"),
					)
				: value;
		const normalized: Record<string, JsonValue> =
			"properties" in withoutDefault && "additionalProperties" in withoutDefault
				? Object.fromEntries(
						Object.entries(withoutDefault).filter(
							([prop]) => prop !== "additionalProperties",
						),
					)
				: withoutDefault;
		if (!azureTransforms) {
			return normalized;
		}
		const nullableValue = markOptionalNullable(normalized);
		return key === "200"
			? wrapAzureArrayResponse(nullableValue)
			: nullableValue;
	}) as { [key: string]: JsonValue };
	const { specification } = upgrade(cleaned);
	const openapi = (specification ?? cleaned) as { [key: string]: JsonValue };
	normalizeOperationResponses(openapi);
	writeFileSync(generated, JSON.stringify(openapi), "utf8");
	return generated;
};

const HOSTS = [
	{
		name: "github",
		target: prepareSpec(
			"./references/hosts/github.openapi.json",
			"./references/hosts/github.openapi.g.json",
			false,
		),
		tags: ["pulls", "checks"],
		baseUrl: "https://api.github.com",
		useExamples: false,
		excludeEmptyContentType: true,
	},
	{
		name: "azure-git",
		target: prepareSpec(
			"./references/hosts/azure-devops-git.json",
			"./references/hosts/azure-devops-git.g.json",
			true,
		),
		tags: ["Pull Requests", "Pull Request Threads", "Pull Request Reviewers"],
		baseUrl: "https://dev.azure.com",
		useExamples: true,
		excludeEmptyContentType: false,
	},
	{
		name: "azure-policy",
		target: prepareSpec(
			"./references/hosts/azure-devops-policy.json",
			"./references/hosts/azure-devops-policy.g.json",
			true,
		),
		tags: ["Evaluations"],
		baseUrl: "https://dev.azure.com",
		useExamples: true,
		excludeEmptyContentType: false,
	},
] as const;

for (const spec of HOSTS) {
	const input = {
		target: spec.target,
		filters: { mode: "include" as const, tags: [...spec.tags] },
	};
	const contentTypeOverride = spec.excludeEmptyContentType
		? { contentType: { exclude: [""] } }
		: {};
	await generate({
		input,
		output: {
			target: `./clients/${spec.name}.g.ts`,
			client: "fetch",
			mode: "single",
			baseUrl: spec.baseUrl,
			override: {
				requestOptions: { headers: { accept: "application/json" } },
				...contentTypeOverride,
				mock: { exactOptional: true, required: true },
			},
			mock: {
				inline: true,
				generators: [
					{
						type: "msw",
						useExamples: spec.useExamples,
						delay: false,
						baseUrl: spec.baseUrl,
					},
				],
			},
		},
	});
	await generate({
		input,
		output: {
			target: `./clients/${spec.name}.zod.g.ts`,
			client: "zod",
			mode: "single",
			override: { ...contentTypeOverride, zod: ZOD_OPTIONS },
		},
	});
}
