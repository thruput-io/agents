import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test as it } from "node:test";
import { fileURLToPath } from "node:url";
import {
	artifactIdOf,
	blockingBuildPolicies,
	changeOf,
	headCommitOf,
	KIND,
	refusalReasons,
	targetCommitOf,
} from "./azure.ts";
import {
	refusalText,
	text,
	threadPayload,
	votePayload,
} from "./azure-review.ts";

const SHA1_HEX_LENGTH = 40;
const SHA_A = "a".repeat(SHA1_HEX_LENGTH);
const SHA_B = "b".repeat(SHA1_HEX_LENGTH);
const HOST = {
	kind: KIND,
	organization: "org",
	project: "proj",
	repository: "repo",
	id: 42,
};

it("headCommitOf, targetCommitOf, changeOf, and artifactIdOf fold an Azure GitPullRequest into domain contracts", () => {
	const pr = {
		lastMergeSourceCommit: { commitId: SHA_A },
		lastMergeTargetCommit: { commitId: SHA_B },
		createdBy: { uniqueName: "me@example.com" },
		repository: {},
	};
	assert.equal(headCommitOf(pr), SHA_A);
	assert.equal(targetCommitOf(pr), SHA_B);
	assert.deepEqual(changeOf(HOST, pr), {
		host: HOST,
		author: "me@example.com",
		description: "",
	});
	assert.equal(
		artifactIdOf(HOST, pr),
		"vstfs:///CodeReview/CodeReviewId/proj/42",
	);
	assert.throws(() =>
		headCommitOf({ lastMergeSourceCommit: { commitId: "invalid" } }),
	);
	assert.throws(() =>
		targetCommitOf({ lastMergeTargetCommit: { commitId: "invalid" } }),
	);
});

it("blockingBuildPolicies and refusalReasons keep only blocking Build policies and merge conflicts", () => {
	const policy = (
		status: "approved" | "rejected",
		isBlocking: boolean,
		displayName: string,
	) => ({
		status,
		configuration: { isBlocking, type: { displayName } },
	});
	const kept = blockingBuildPolicies([
		policy("rejected", true, "Build"),
		policy("approved", true, "Build"),
		policy("rejected", false, "Build"),
		policy("rejected", true, "Reviewers"),
	]);
	assert.deepEqual(
		kept.map((item) => item.status),
		["rejected", "approved"],
	);
	assert.deepEqual(refusalReasons("conflicts", kept), [
		"pull request has merge conflicts",
		"the blocking Build policy is rejected",
	]);
});

it("text, threadPayload, refusalText, and votePayload transform domain contracts into Azure DevOps payloads", () => {
	assert.deepEqual(text("c"), {
		comments: [{ parentCommentId: 0, commentType: "text", content: "c" }],
		status: "active",
	});
	assert.deepEqual(
		threadPayload({
			path: "p",
			side: "head",
			lines: { start: 3, end: 3 },
			body: "r",
		}),
		{
			...text("r"),
			threadContext: {
				filePath: "/p",
				rightFileStart: { line: 3, offset: 1 },
				rightFileEnd: { line: 3, offset: 1 },
			},
		},
	);
	assert.deepEqual(
		threadPayload({
			path: "p",
			side: "base",
			lines: { start: 1, end: 4 },
			body: "r",
		}).threadContext,
		{
			filePath: "/p",
			leftFileStart: { line: 1, offset: 1 },
			leftFileEnd: { line: 4, offset: 1 },
		},
	);
	assert.equal(
		refusalText(SHA_A, "policy rejected").comments?.[0]?.content?.includes(
			`Not reviewed at ${SHA_A}`,
		),
		true,
	);
	assert.deepEqual(votePayload("approve"), { vote: 10 });
	assert.deepEqual(votePayload("request-changes"), { vote: -10 });
});

const SEQUENTIAL_FOR_AWAIT_RE = /for\s*\([^)]+\)\s*\{\s*await\b/u;

it("AzureDevOpsAdapter.post dispatches thread network requests concurrently via Promise.all with no sequential await-in-for-loop", () => {
	const adapterSource = readFileSync(
		join(dirname(fileURLToPath(import.meta.url)), "azure-adapter.ts"),
		"utf8",
	);
	assert.equal(SEQUENTIAL_FOR_AWAIT_RE.test(adapterSource), false);
});
