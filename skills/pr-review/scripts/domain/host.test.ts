import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test as it } from "node:test";
import { z } from "zod";
import { TargetSchema } from "./host.ts";

it("a GitHub pull request URL is a GitHub host, and nothing else", () => {
	const host = {
		kind: "github",
		owner: "thruput-io",
		repository: "agents",
		number: 14,
	};
	assert.deepEqual(
		TargetSchema.parse("https://github.com/thruput-io/agents/pull/14"),
		host,
	);
	assert.deepEqual(
		TargetSchema.parse(
			"https://github.com/thruput-io/agents/pull/14/files#diff-1",
		),
		host,
	);
});

it("an Azure DevOps pull request URL is an Azure DevOps host, with or without a query", () => {
	const host = {
		kind: "azure-devops",
		organization: "NavistarCollection",
		project: "NavistarProduction",
		repository: "DS-DD-DataIntegration-Platform",
		id: 57_121,
	};
	assert.deepEqual(
		TargetSchema.parse(
			"https://dev.azure.com/NavistarCollection/NavistarProduction/_git/DS-DD-DataIntegration-Platform/pullrequest/57121",
		),
		host,
	);
	assert.deepEqual(
		TargetSchema.parse(
			"https://dev.azure.com/NavistarCollection/NavistarProduction/_git/DS-DD-DataIntegration-Platform/pullrequest/57121?path=/a.cs",
		),
		host,
	);
});

it("a repository path with two refs is a git host, its path made absolute", () => {
	assert.deepEqual(TargetSchema.parse(".@main..HEAD"), {
		kind: "git",
		repository: resolve("."),
		base: "main",
		head: "HEAD",
	});
	assert.deepEqual(TargetSchema.parse("/w/repo@origin/main..feature/x"), {
		kind: "git",
		repository: "/w/repo",
		base: "origin/main",
		head: "feature/x",
	});
});

it("a target that is none of these is refused with the reason", () => {
	assert.throws(
		() => TargetSchema.parse("https://example.com/x"),
		(error: Error) =>
			z
				.prettifyError(error as z.ZodError)
				.includes("is not a pull request URL this skill knows"),
	);
});
