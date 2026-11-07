import assert from "node:assert/strict";
import { test as it } from "node:test";
import { AccessToken } from "./access-token.ts";
import {
	AzureMergeRequest,
	GitDiff,
	GithubPullRequest,
} from "./code-under-review.ts";
import {
	CodeUnderReviewFactory,
	CodeUnderReviewSnapshot,
	rendered,
} from "./review-snapshot.ts";
import { SnapshotDirectory } from "./snapshot-directory.ts";

it("AccessToken parses a non-empty token, builds authorization headers, and compares by value", () => {
	const first = AccessToken.from("ghp_secret");
	const second = AccessToken.from("ghp_secret");
	const other = AccessToken.from("ghp_other");
	assert.equal(first.success, true);
	assert.equal(second.success, true);
	assert.equal(other.success, true);
	assert.equal(first.data.equals(second.data), true);
	assert.equal(first.data.equals(other.data), false);
	assert.deepEqual(first.data.requestInit(), {
		headers: { authorization: "Bearer ghp_secret" },
	});
	assert.deepEqual(
		first.data.requestInitWithHeaders({ accept: "text/plain" }),
		{
			headers: {
				accept: "text/plain",
				authorization: "Bearer ghp_secret",
			},
		},
	);
	assert.equal(AccessToken.from("").success, false);
});

it("SnapshotDirectory parses a non-empty path and compares by value", () => {
	const dir = SnapshotDirectory.from("/tmp/work/snapshot");
	const same = SnapshotDirectory.from("/tmp/work/snapshot");
	assert.equal(dir.success, true);
	assert.equal(same.success, true);
	assert.equal(dir.data.equals(same.data), true);
	assert.equal(SnapshotDirectory.from("").success, false);
});

it("GithubPullRequest exposes its host, surface, fragments, and threads", () => {
	const pr = GithubPullRequest.from({
		kind: "github",
		owner: "thruput-io",
		repository: "agents",
		number: 14,
	});
	assert.equal(pr.success, true);
	assert.deepEqual(pr.data.host(), {
		kind: "github",
		owner: "thruput-io",
		repository: "agents",
		number: 14,
	});
	assert.deepEqual(pr.data.surface(), []);
	assert.deepEqual(pr.data.fragments(), []);
	assert.deepEqual(pr.data.threads(), { threads: [] });
});

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

it("CodeUnderReviewSnapshot wraps a CodeUnderReview and exposes its SnapshotDirectory", () => {
	const pr = GithubPullRequest.from({
		kind: "github",
		owner: "thruput-io",
		repository: "agents",
		number: 14,
	});
	const dir = SnapshotDirectory.from("/tmp/work/snapshot");
	assert.equal(pr.success, true);
	assert.equal(dir.success, true);
	const snapshot = CodeUnderReviewSnapshot.from(pr.data, dir.data).withReview(
		[
			{
				path: "a.ts",
				fragments: [
					{ kind: "surface", side: "head", lines: { "1": "const a = 1;" } },
				],
			},
		],
		[{ kind: "surface", side: "head", lines: { "1": "const a = 1;" } }],
		{ threads: [] },
	);
	assert.equal(snapshot.snapShot.equals(dir.data), true);
	assert.deepEqual(snapshot.host(), pr.data.host());
	assert.equal(snapshot.surface().length, 1);
	assert.equal(snapshot.fragments().length, 1);
	assert.deepEqual(snapshot.threads(), { threads: [] });
});

it("rendered writes the review as markdown with summary, inline findings, and ledger", () => {
	const outcome = {
		headCommit: "h",
		verdict: "request-changes" as const,
		summary: "s",
		inline: [
			{
				path: "p",
				side: "head" as const,
				lines: { start: 3, end: 4 },
				body: "r",
			},
		],
		settle: [],
		reopen: [],
	};
	assert.equal(
		rendered(outcome, "| t |"),
		"s\n\n- `p:3-4` (head): r\n\n| t |\n",
	);
	assert.equal(rendered({ ...outcome, inline: [] }, "| t |"), "s\n\n| t |\n");
});
