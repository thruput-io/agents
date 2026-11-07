import assert from "node:assert/strict";
import { test as it } from "node:test";
import { getPullsGetResponseMock } from "../../clients/github.g.ts";
import {
	changeOf,
	failedChecks,
	headCommitOf,
	postedAt,
	priorOf,
	refusalReasons,
	refusedIn,
	remoteUrlOf,
} from "./github.ts";
import { comment, payload, refusalPayload } from "./github-review.ts";
import {
	type GitHubThreadNode,
	isReviewableThreadNode,
	RESOLVE_REVIEW_THREAD_MUTATION,
	REVIEW_THREADS_QUERY,
	ThreadsPage,
	thread,
	UNRESOLVE_REVIEW_THREAD_MUTATION,
} from "./github-threads.ts";
import { SITE } from "./rulebook.ts";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const HOST = {
	kind: "github" as const,
	owner: "octocat",
	repository: "hello-world",
	number: 14,
};

it("changeOf, headCommitOf, and remoteUrlOf fold a GitHub PullRequest into domain contracts", () => {
	const basePull = getPullsGetResponseMock({ body: null });
	const pr = {
		...basePull,
		head: {
			...basePull.head,
			sha: SHA_A,
			ref: "feature",
			repo: null,
		},
		user: { ...basePull.user, login: "author" },
		body: null,
	};
	assert.equal(headCommitOf(pr), SHA_A);
	assert.deepEqual(changeOf(HOST, pr), {
		host: HOST,
		author: "author",
		description: "",
	});
	assert.equal(
		remoteUrlOf(HOST, pr),
		"https://github.com/octocat/hello-world.git",
	);
});

it("failedChecks and refusalReasons report non-passing checks and merge conflicts", () => {
	const failed = failedChecks([
		{ name: "build", conclusion: "success" },
		{ name: "lint", conclusion: "failure" },
		{ name: "docs", conclusion: "skipped" },
		{ name: "queued", conclusion: null },
	]);
	assert.deepEqual(failed, [
		"check lint did not succeed",
		"check queued did not succeed",
	]);
	assert.deepEqual(refusalReasons("dirty", failed), [
		"pull request has merge conflicts",
		"check lint did not succeed",
		"check queued did not succeed",
	]);
	assert.deepEqual(refusalReasons("clean", []), []);
});

it("ThreadsPage parses GraphQL review threads and isReviewableThreadNode filters outdated and human threads", () => {
	const citedBody = `Unused export breaks [Simplicity](${SITE}#simplicity)`;
	const page = {
		data: {
			repository: {
				pullRequest: {
					reviewThreads: {
						pageInfo: { hasNextPage: false, endCursor: null },
						nodes: [
							{
								id: "T1",
								path: "a.sh",
								line: 9,
								startLine: null,
								diffSide: "RIGHT",
								isResolved: false,
								resolvedBy: null,
								comments: { nodes: [{ body: citedBody }] },
							},
							{
								id: "T2",
								path: "a.sh",
								line: null,
								startLine: null,
								diffSide: "RIGHT",
								isResolved: false,
								resolvedBy: null,
								comments: { nodes: [{ body: citedBody }] },
							},
							{
								id: "T3",
								path: "a.sh",
								line: 5,
								startLine: null,
								diffSide: "RIGHT",
								isResolved: false,
								resolvedBy: null,
								comments: { nodes: [{ body: "Human comment" }] },
							},
						],
					},
				},
			},
		},
	};
	const parsed = ThreadsPage.parse(page);
	assert.equal(parsed.nodes.filter(isReviewableThreadNode).length, 1);
	assert.equal(REVIEW_THREADS_QUERY.includes("$after: String"), true);
	assert.equal(
		RESOLVE_REVIEW_THREAD_MUTATION.includes("resolveReviewThread"),
		true,
	);
	assert.equal(
		UNRESOLVE_REVIEW_THREAD_MUTATION.includes("unresolveReviewThread"),
		true,
	);
});

it("thread folds a review thread into side, lines, and whether the author resolved it", () => {
	const citedBody = `Unused export breaks [Simplicity](${SITE}#simplicity)`;
	const node = (fields: Partial<GitHubThreadNode>): GitHubThreadNode => ({
		id: "T",
		path: "a.sh",
		line: 9,
		startLine: 8,
		diffSide: "RIGHT",
		isResolved: false,
		resolvedBy: null,
		comments: { nodes: [{ body: citedBody }] },
		...fields,
	});
	assert.deepEqual(thread(node({}), "author"), {
		id: "T",
		path: "a.sh",
		side: "head",
		lines: { start: 8, end: 9 },
		state: "open",
		body: citedBody,
	});
	assert.equal(
		thread(
			node({ isResolved: true, resolvedBy: { login: "author" } }),
			"author",
		).state,
		"resolved-by-author",
	);
	assert.equal(
		thread(
			node({ isResolved: true, resolvedBy: { login: "someone" } }),
			"author",
		).state,
		"resolved",
	);
	assert.deepEqual(
		thread(node({ startLine: null, diffSide: "LEFT" }), "author").lines,
		{ start: 9, end: 9 },
	);
	assert.equal(thread(node({ diffSide: "LEFT" }), "author").side, "base");
});

it("comment, payload, and refusalPayload transform domain contracts into GitHub review bodies", () => {
	const one = {
		path: "p",
		side: "head" as const,
		lines: { start: 3, end: 3 },
		body: "r",
	};
	const range = {
		path: "q",
		side: "base" as const,
		lines: { start: 1, end: 4 },
		body: "r",
	};
	assert.deepEqual(comment(one), {
		path: "p",
		line: 3,
		side: "RIGHT",
		body: "r",
	});
	assert.deepEqual(comment(range), {
		path: "q",
		start_line: 1,
		start_side: "LEFT",
		line: 4,
		side: "LEFT",
		body: "r",
	});
	const review = payload(
		{
			headCommit: SHA_A,
			verdict: "request-changes",
			summary: "s",
			inline: [one],
			settle: [],
			reopen: [],
		},
		"| t |",
	);
	assert.equal(review.commit_id, SHA_A);
	assert.equal(review.event, "REQUEST_CHANGES");
	assert.equal(
		review.body,
		"s\n\n<details>\n<summary>Review ledger</summary>\n\n| t |\n\n</details>",
	);
	assert.deepEqual(review.comments, [comment(one)]);
	assert.equal(
		payload(
			{
				headCommit: SHA_A,
				verdict: "approve",
				summary: "s",
				inline: [],
				settle: [],
				reopen: [],
			},
			"",
		).event,
		"APPROVE",
	);
	assert.equal(
		refusalPayload(SHA_A, "check build did not succeed").event,
		"REQUEST_CHANGES",
	);
});

it("refusedIn, postedAt, and priorOf inspect GitHub review records", () => {
	const refusal = {
		state: "CHANGES_REQUESTED",
		html_url: "https://github.com/o/r/pull/1#pullrequestreview-5",
		body: `**Verdict: request-changes**\n\nNot reviewed at ${SHA_A} against [the rules](${SITE}): check build did not succeed.`,
	};
	assert.equal(refusedIn([refusal], SHA_A), refusal.html_url);
	assert.equal(refusedIn([refusal], SHA_B), null);

	const review = {
		state: "CHANGES_REQUESTED",
		html_url: "https://github.com/o/r/pull/1#pullrequestreview-7",
		body: `**Verdict: request-changes**\n\n3 rules probed by 2 probes at ${SHA_A} against [the rules](${SITE}): 1 violations`,
	};
	assert.equal(postedAt([review], SHA_A), review.html_url);
	assert.equal(postedAt([review], SHA_B), null);
	assert.equal(priorOf([refusal, review]), SHA_A);
});
