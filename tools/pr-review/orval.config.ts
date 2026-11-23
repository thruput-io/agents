import { defineConfig } from "orval";

const GITHUB_SPEC = "./references/hosts/github.openapi.json";
const AZURE_GIT_SPEC = "./references/hosts/azure-devops-git.json";
const AZURE_POLICY_SPEC = "./references/hosts/azure-devops-policy.json";

const GITHUB_URL = "https://api.github.com";
const AZURE_URL = "https://dev.azure.com";

const GITHUB_OPERATIONS = {
	mode: "include" as const,
	operationIds: [
		"pulls/get",
		"pulls/list-files",
		"pulls/list-reviews",
		"pulls/create-review",
		"checks/list-for-ref",
		"repos/download-zipball-archive",
	],
};

const AZURE_GIT_OPERATIONS = {
	mode: "include" as const,
	operationIds: [
		"Pull Requests_Get Pull Request",
		"Pull Request Threads_List",
		"Pull Request Threads_Create",
		"Pull Request Threads_Update",
		"Pull Request Reviewers_Create Pull Request Reviewer",
		"Pull Request Reviewers_Update Pull Request Reviewers",
		"Items_List",
	],
};

const AZURE_POLICY_OPERATIONS = {
	mode: "include" as const,
	operationIds: ["Evaluations_List"],
};

const GITHUB_CONTENT_TYPES = {
	exclude: ["", "application/vnd.github.diff", "application/vnd.github.patch"],
};

const JSON_REQUESTS = { headers: { accept: "application/json" } };
const COMPLETE_MOCKS = { exactOptional: true, required: true };

const ZOD = {
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

export default defineConfig({
	github: {
		input: { target: GITHUB_SPEC, filters: GITHUB_OPERATIONS },
		output: {
			target: "./src/generated/github/github.g.ts",
			client: "fetch",
			mode: "single",
			baseUrl: GITHUB_URL,
			override: {
				requestOptions: JSON_REQUESTS,
				contentType: GITHUB_CONTENT_TYPES,
				mock: COMPLETE_MOCKS,
			},
			mock: {
				inline: true,
				generators: [
					{
						type: "msw",
						useExamples: false,
						delay: false,
						baseUrl: GITHUB_URL,
					},
				],
			},
		},
	},
	githubZod: {
		input: { target: GITHUB_SPEC, filters: GITHUB_OPERATIONS },
		output: {
			target: "./src/generated/github/github.zod.g.ts",
			client: "zod",
			mode: "single",
			override: { contentType: GITHUB_CONTENT_TYPES, zod: ZOD },
		},
	},
	azureGit: {
		input: { target: AZURE_GIT_SPEC, filters: AZURE_GIT_OPERATIONS },
		output: {
			target: "./src/generated/azure/azure-git.g.ts",
			client: "fetch",
			mode: "single",
			baseUrl: AZURE_URL,
			override: { requestOptions: JSON_REQUESTS, mock: COMPLETE_MOCKS },
			mock: {
				inline: true,
				generators: [
					{ type: "msw", useExamples: true, delay: false, baseUrl: AZURE_URL },
				],
			},
		},
	},
	azureGitZod: {
		input: { target: AZURE_GIT_SPEC, filters: AZURE_GIT_OPERATIONS },
		output: {
			target: "./src/generated/azure/azure-git.zod.g.ts",
			client: "zod",
			mode: "single",
			override: { zod: ZOD },
		},
	},
	azurePolicy: {
		input: { target: AZURE_POLICY_SPEC, filters: AZURE_POLICY_OPERATIONS },
		output: {
			target: "./src/generated/azure/azure-policy.g.ts",
			client: "fetch",
			mode: "single",
			baseUrl: AZURE_URL,
			override: { requestOptions: JSON_REQUESTS, mock: COMPLETE_MOCKS },
			mock: {
				inline: true,
				generators: [
					{ type: "msw", useExamples: true, delay: false, baseUrl: AZURE_URL },
				],
			},
		},
	},
	azurePolicyZod: {
		input: { target: AZURE_POLICY_SPEC, filters: AZURE_POLICY_OPERATIONS },
		output: {
			target: "./src/generated/azure/azure-policy.zod.g.ts",
			client: "zod",
			mode: "single",
			override: { zod: ZOD },
		},
	},
});
