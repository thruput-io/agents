import { defineConfig } from "orval";

export default defineConfig({
	github: {
		input: {
			target: "./references/hosts/github.openapi.json",
			filters: { mode: "include", tags: ["pulls", "checks", "repos"] },
		},
		output: {
			target: "./src/adapters/github/github.g.ts",
			client: "fetch",
			mode: "single",
			baseUrl: "https://api.github.com",
		},
	},
	githubZod: {
		input: {
			target: "./references/hosts/github.openapi.json",
			filters: { mode: "include", tags: ["pulls", "checks", "repos"] },
		},
		output: {
			target: "./src/adapters/github/github.zod.g.ts",
			client: "zod",
			mode: "single",
		},
	},
	azureGit: {
		input: {
			target: "./references/hosts/azure-devops-git.json",
			filters: {
				mode: "include",
				tags: [
					"Pull Requests",
					"Pull Request Threads",
					"Pull Request Reviewers",
					"Items",
				],
			},
		},
		output: {
			target: "./src/adapters/azure/azure-git.g.ts",
			client: "fetch",
			mode: "single",
			baseUrl: "https://dev.azure.com",
		},
	},
	azureGitZod: {
		input: {
			target: "./references/hosts/azure-devops-git.json",
			filters: {
				mode: "include",
				tags: [
					"Pull Requests",
					"Pull Request Threads",
					"Pull Request Reviewers",
					"Items",
				],
			},
		},
		output: {
			target: "./src/adapters/azure/azure-git.zod.g.ts",
			client: "zod",
			mode: "single",
		},
	},
	azurePolicy: {
		input: {
			target: "./references/hosts/azure-devops-policy.json",
			filters: { mode: "include", tags: ["Evaluations"] },
		},
		output: {
			target: "./src/adapters/azure/azure-policy.g.ts",
			client: "fetch",
			mode: "single",
			baseUrl: "https://dev.azure.com",
		},
	},
	azurePolicyZod: {
		input: {
			target: "./references/hosts/azure-devops-policy.json",
			filters: { mode: "include", tags: ["Evaluations"] },
		},
		output: {
			target: "./src/adapters/azure/azure-policy.zod.g.ts",
			client: "zod",
			mode: "single",
		},
	},
});
