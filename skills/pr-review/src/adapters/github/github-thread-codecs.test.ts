import assert from "node:assert/strict";
import { test as it } from "node:test";
import { SITE } from "../../domain/rulebook.ts";
import {
	type GitHubThreadNode,
	isReviewableThreadNode,
	RESOLVE_REVIEW_THREAD_MUTATION,
	REVIEW_THREADS_QUERY,
	ThreadsPage,
	thread,
	UNRESOLVE_REVIEW_THREAD_MUTATION,
} from "./github-thread-codecs.ts";

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
								diffSide: "RIGHT" as const,
								isResolved: false,
								resolvedBy: null,
								comments: { nodes: [{ body: citedBody }] },
							},
							{
								id: "T2",
								path: "a.sh",
								line: null,
								startLine: null,
								diffSide: "RIGHT" as const,
								isResolved: false,
								resolvedBy: null,
								comments: { nodes: [{ body: citedBody }] },
							},
							{
								id: "T3",
								path: "a.sh",
								line: 5,
								startLine: null,
								diffSide: "RIGHT" as const,
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
	const parsed = ThreadsPage.decode(page);
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
