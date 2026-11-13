import { generate } from "orval";

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

const HOSTS = [
	{
		name: "github",
		target: "./references/hosts/github.openapi.json",
		tags: ["pulls", "checks", "repos"],
		baseUrl: "https://api.github.com",
		useExamples: false,
		excludeContentTypes: [
			"",
			"application/vnd.github.diff",
			"application/vnd.github.patch",
		],
	},
	{
		name: "azure-git",
		target: "./references/hosts/azure-devops-git.json",
		tags: [
			"Pull Requests",
			"Pull Request Threads",
			"Pull Request Reviewers",
			"Items",
		],
		baseUrl: "https://dev.azure.com",
		useExamples: true,
		excludeContentTypes: [],
	},
	{
		name: "azure-policy",
		target: "./references/hosts/azure-devops-policy.json",
		tags: ["Evaluations"],
		baseUrl: "https://dev.azure.com",
		useExamples: true,
		excludeContentTypes: [],
	},
] as const;

for (const spec of HOSTS) {
	const input = {
		target: spec.target,
		filters: { mode: "include" as const, tags: [...spec.tags] },
	};
	const contentTypeOverride =
		spec.excludeContentTypes.length > 0
			? { contentType: { exclude: [...spec.excludeContentTypes] } }
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
