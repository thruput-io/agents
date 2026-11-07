import { readFileSync, writeFileSync } from "node:fs";
import { generate } from "orval";

type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

const UTF8_BOM = /^\uFEFF/u;

const prepareSpec = (source: string, generated: string): string => {
	const raw = readFileSync(source, "utf8").replace(UTF8_BOM, "");
	const cleaned = JSON.parse(raw, (key, value: JsonValue) =>
		key === "x-ms-examples" ? undefined : value,
	) as JsonValue;
	writeFileSync(generated, JSON.stringify(cleaned), "utf8");
	return generated;
};

await generate({
	input: {
		target: "./references/hosts/github.openapi.json",
		filters: {
			mode: "include",
			tags: ["pulls", "checks"],
		},
	},
	output: {
		target: "./clients/github.g.ts",
		client: "fetch",
		mode: "single",
		baseUrl: "https://api.github.com",
		override: {
			contentType: {
				exclude: [""],
			},
			mock: {
				exactOptional: true,
				required: true,
			},
		},
		mock: {
			inline: true,
			generators: [
				{
					type: "msw",
					useExamples: false,
					delay: false,
					baseUrl: "https://api.github.com",
				},
			],
		},
	},
});

await generate({
	input: {
		target: prepareSpec(
			"./references/hosts/azure-devops-git.json",
			"./references/hosts/azure-devops-git.g.json",
		),
		filters: {
			mode: "include",
			tags: ["Pull Requests", "Pull Request Threads", "Pull Request Reviewers"],
		},
	},
	output: {
		target: "./clients/azure-git.g.ts",
		client: "fetch",
		mode: "single",
		baseUrl: "https://dev.azure.com",
		override: {
			mock: {
				exactOptional: true,
				required: true,
			},
		},
		mock: {
			inline: true,
			generators: [
				{
					type: "msw",
					useExamples: true,
					delay: false,
					baseUrl: "https://dev.azure.com",
				},
			],
		},
	},
});

await generate({
	input: {
		target: prepareSpec(
			"./references/hosts/azure-devops-policy.json",
			"./references/hosts/azure-devops-policy.g.json",
		),
		filters: {
			mode: "include",
			tags: ["Evaluations"],
		},
	},
	output: {
		target: "./clients/azure-policy.g.ts",
		client: "fetch",
		mode: "single",
		baseUrl: "https://dev.azure.com",
		override: {
			mock: {
				exactOptional: true,
				required: true,
			},
		},
		mock: {
			inline: true,
			generators: [
				{
					type: "msw",
					useExamples: true,
					delay: false,
					baseUrl: "https://dev.azure.com",
				},
			],
		},
	},
});
