import assert from "node:assert/strict";
import { test as it } from "node:test";
import { AccessToken } from "../domain/access-token.ts";
import { GithubPullRequest } from "../domain/code-under-review.ts";
import { AzureMergeRequest } from "./azure/azure-merge-request.ts";
import { CodeUnderReviewFactory } from "./code-under-review-factory.ts";
import { GitDiff } from "./git/git-diff.ts";

it("AzureMergeRequest exposes its host, surface, fragments, and threads", () => {
	const mr = AzureMergeRequest.from({
		kind: "azure-devops",
		organization: "Org",
		project: "Proj",
		repository: "Repo",
		id: 99,
	});
	assert.equal(mr.success, true);
	assert.deepEqual(mr.data.host(), {
		kind: "azure-devops",
		organization: "Org",
		project: "Proj",
		repository: "Repo",
		id: 99,
	});
	assert.deepEqual(mr.data.surface(), []);
	assert.deepEqual(mr.data.fragments(), []);
	assert.deepEqual(mr.data.threads(), { threads: [] });
});

it("GitDiff exposes its host, surface, fragments, and threads", () => {
	const diff = GitDiff.from({
		kind: "git",
		repository: "/repo",
		base: "main",
		head: "HEAD",
	});
	assert.equal(diff.success, true);
	assert.deepEqual(diff.data.host(), {
		kind: "git",
		repository: "/repo",
		base: "main",
		head: "HEAD",
	});
	assert.deepEqual(diff.data.surface(), []);
	assert.deepEqual(diff.data.fragments(), []);
	assert.deepEqual(diff.data.threads(), { threads: [] });
});

it("CodeUnderReviewFactory parses GitHub, Azure DevOps, and Git targets into their concrete classes", () => {
	const gh = CodeUnderReviewFactory.from(
		"https://github.com/thruput-io/agents/pull/14/files#diff-1",
	);
	assert.equal(gh.success, true);
	assert.equal(gh.data instanceof GithubPullRequest, true);
	assert.deepEqual(gh.data.host(), {
		kind: "github",
		owner: "thruput-io",
		repository: "agents",
		number: 14,
	});

	const token = AccessToken.from("ghp_secret");
	assert.equal(token.success, true);
	const az = CodeUnderReviewFactory.fromWithToken(
		"https://dev.azure.com/Org/Proj/_git/Repo/pullrequest/99",
		token.data,
	);
	assert.equal(az.success, true);
	assert.equal(az.data instanceof AzureMergeRequest, true);

	const git = CodeUnderReviewFactory.from("/repo@main..HEAD");
	assert.equal(git.success, true);
	assert.equal(git.data instanceof GitDiff, true);

	assert.equal(
		CodeUnderReviewFactory.from("https://example.com/not-a-pr").success,
		false,
	);
});
