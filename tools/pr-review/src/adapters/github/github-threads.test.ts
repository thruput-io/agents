import assert from "node:assert/strict";
import { test as it } from "node:test";
import { ClientError } from "graphql-request";
import { nonnull } from "../../domain/nullish.ts";
import {
	getChecksListForRefResponseMock,
	getPullsCreateReviewResponseMock,
	getPullsGetResponseMock,
	getPullsListReviewsResponseMock,
} from "../../generated/github/github.g.ts";
import {
	GitHubCheckRunsCodec,
	GitHubCreatedReviewCodec,
	GitHubPullRequestCodec,
	GitHubReviewsCodec,
} from "./github.ts";
import { GitHubReviewPayloadCodec } from "./github-review.ts";
import { GitHubReviewCommentCodec } from "./github-review-comment.ts";
import { REVIEW_THREADS_QUERY, ThreadsPage } from "./github-thread-codecs.ts";
import {
	fetchGitHubThreads,
	settleAndReopenGitHubThreads,
} from "./github-threads.ts";

const SHA1_HEX_LENGTH = 40;
const SHA_A = "a".repeat(SHA1_HEX_LENGTH);
const EXPECTED_CONCURRENT_MUTATIONS = 3;
const HTTP_FORBIDDEN = 403;
const TOTAL_COUNT_KEY = "total_count";
const CHECK_RUNS_KEY = "check_runs";
const HOST = {
	kind: "github" as const,
	owner: "thruput-io",
	repository: "agents",
	number: 14,
};

it("GitHub thread mutations dispatch concurrently without waiting sequentially", async () => {
	let inFlight = 0;
	let maxInFlight = 0;
	const fakeClient = {
		rawRequest: async () => {
			inFlight += 1;
			maxInFlight = Math.max(maxInFlight, inFlight);
			await new Promise((resolve) => setTimeout(resolve, 10));
			inFlight -= 1;
			return { data: {} };
		},
	};
	await settleAndReopenGitHubThreads(
		fakeClient as unknown as Parameters<typeof settleAndReopenGitHubThreads>[0],
		["T1", "T2"],
		["T3"],
	);
	assert.equal(maxInFlight, EXPECTED_CONCURRENT_MUTATIONS);
});

it("fetchGitHubThreads reports viewerCanUpdate and GraphQL client errors", async () => {
	const readOnlyClient = {
		rawRequest: () =>
			Promise.resolve({
				data: {
					repository: {
						pullRequest: {
							viewerCanUpdate: false,
							reviewThreads: {
								pageInfo: { hasNextPage: false, endCursor: null },
								nodes: [],
							},
						},
					},
				},
			}),
	};
	const readOnlyRes = await fetchGitHubThreads(
		readOnlyClient as unknown as Parameters<typeof fetchGitHubThreads>[0],
		HOST,
		"author",
	);
	assert.deepEqual(readOnlyRes, {
		ok: true,
		viewerCanUpdate: false,
		threads: [],
	});

	const failingClient = {
		rawRequest: () =>
			Promise.reject(
				new ClientError(
					{
						status: HTTP_FORBIDDEN,
						body: "",
						headers: new Headers({ "content-type": "application/json" }),
					},
					{ query: REVIEW_THREADS_QUERY },
				),
			),
	};
	const failedRes = await fetchGitHubThreads(
		failingClient as unknown as Parameters<typeof fetchGitHubThreads>[0],
		HOST,
		"author",
	);
	assert.equal(failedRes.ok, false);
	assert.equal(
		(failedRes as Extract<typeof failedRes, { readonly ok: false }>).status,
		HTTP_FORBIDDEN,
	);
});

it("GitHub review and thread codecs round-trip inline findings and review payloads", () => {
	const singleLine = {
		path: "src/a.ts",
		side: "head" as const,
		lines: { start: 7, end: 7 },
		body: "single line finding",
	};
	const multiLine = {
		path: "src/b.ts",
		side: "base" as const,
		lines: { start: 2, end: 5 },
		body: "multi line finding",
	};
	const encodedSingle = GitHubReviewCommentCodec.encode(singleLine);
	assert.deepEqual(GitHubReviewCommentCodec.decode(encodedSingle), singleLine);
	const encodedMulti = GitHubReviewCommentCodec.encode(multiLine);
	assert.deepEqual(GitHubReviewCommentCodec.decode(encodedMulti), multiLine);

	const outcome = {
		headCommit: SHA_A,
		verdict: "request-changes" as const,
		summary: "Summary header",
		inline: [singleLine, multiLine],
		settle: [],
		reopen: [],
	};
	const encodedReview = GitHubReviewPayloadCodec.encode({
		outcome,
		ledgerTable: "| Rule | Verdict |",
	});
	const decodedReview = GitHubReviewPayloadCodec.decode(encodedReview);
	assert.deepEqual(decodedReview, {
		outcome,
		ledgerTable: "| Rule | Verdict |",
	});

	const page = {
		pageInfo: { hasNextPage: false, endCursor: null },
		nodes: [],
	};
	const encodedPage = ThreadsPage.encode(page);
	assert.deepEqual(ThreadsPage.decode(encodedPage), page);
});

it("GitHub REST codecs decode and encode check runs, pull requests, and reviews", () => {
	const checkRun = {
		...nonnull(getChecksListForRefResponseMock().check_runs[0]),
		id: 1,
		name: "ci",
		conclusion: "success" as const,
	};
	assert.equal(
		GitHubCheckRunsCodec.decode({
			[TOTAL_COUNT_KEY]: 1,
			[CHECK_RUNS_KEY]: [checkRun],
		}).length,
		1,
	);
	const mockPr = getPullsGetResponseMock({ body: null });
	assert.equal(
		GitHubPullRequestCodec.decode(GitHubPullRequestCodec.encode(mockPr)).id,
		mockPr.id,
	);
	const mockReviews = getPullsListReviewsResponseMock();
	assert.equal(
		GitHubReviewsCodec.decode(GitHubReviewsCodec.encode(mockReviews)).length,
		mockReviews.length,
	);
	const mockCreatedReview = getPullsCreateReviewResponseMock();
	assert.equal(
		GitHubCreatedReviewCodec.decode(
			GitHubCreatedReviewCodec.encode(mockCreatedReview),
		).html_url,
		mockCreatedReview.html_url,
	);
});
