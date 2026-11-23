import { HttpResponse, http } from "msw";
import { nonnull } from "../domain/nullish.ts";
import { SITE } from "../domain/rulebook.ts";
import {
	getPullRequestsGetPullRequestMockHandler,
	getPullRequestsGetPullRequestResponseMock,
	getPullRequestThreadsCreateResponseMock,
	getPullRequestThreadsListMockHandler,
	getPullRequestThreadsListResponseMock,
	getPullRequestThreadsUpdateResponseMock,
} from "../generated/azure/azure-git.g.ts";
import {
	PullRequestThreadsCreateBody,
	PullRequestThreadsUpdateBody,
} from "../generated/azure/azure-git.zod.g.ts";
import type { ScenarioRepo } from "./scenario-repo.ts";

const BASE_CREATED_THREAD_ID = 200;
const REFUSAL_THREAD_ID = 90;
const PRIOR_SUMMARY_THREAD_ID = 91;

interface AzureReReviewRecorder {
	readonly patchedThreads: Array<{
		readonly id: string;
		readonly status: string;
	}>;
	readonly createdThreads: number[];
}

const summaryThread = (
	id: number,
	content: string,
	baseThread: ReturnType<
		typeof getPullRequestThreadsListResponseMock
	>["value"][number],
) => ({
	...baseThread,
	id,
	status: "active" as const,
	threadContext: null,
	pullRequestThreadContext: null,
	identities: null,
	comments: [{ content }],
});

const createReReviewThreadsHandler = (repo: ScenarioRepo) => {
	const baseThread = nonnull(getPullRequestThreadsListResponseMock().value[0]);
	const citeYagni = `[You aren't gonna need it](${SITE}#you-arent-gonna-need-it)`;
	return getPullRequestThreadsListMockHandler({
		count: 5,
		value: [
			summaryThread(
				REFUSAL_THREAD_ID,
				`**Verdict: request-changes**\n\nNot reviewed at ${repo.headCommit} against [the rules](${SITE}): policy 'Build' is rejected.`,
				baseThread,
			),
			summaryThread(
				PRIOR_SUMMARY_THREAD_ID,
				`**Verdict: request-changes**\n\n1 rules probed by 1 probes at ${repo.headCommit} against [the rules](${SITE}): 1 violations`,
				baseThread,
			),
			{
				...baseThread,
				id: 10,
				status: "active",
				identities: null,
				threadContext: {
					filePath: "/service.ts",
					rightFileStart: { line: 2, offset: 1 },
					rightFileEnd: { line: 2, offset: 1 },
				},
				comments: [{ content: `Unused export y breaks ${citeYagni}` }],
			},
			{
				...baseThread,
				id: 11,
				status: "fixed",
				identities: null,
				threadContext: {
					filePath: "/helper.ts",
					rightFileStart: { line: 1, offset: 1 },
					rightFileEnd: { line: 1, offset: 1 },
				},
				comments: [{ content: `Unused export z breaks ${citeYagni}` }],
			},
			{
				...baseThread,
				id: 12,
				status: "active",
				identities: null,
				threadContext: {
					filePath: "/helper.ts",
					rightFileStart: { line: 1, offset: 1 },
					rightFileEnd: { line: 1, offset: 1 },
				},
				comments: [{ content: "Human comment" }],
			},
		],
	});
};

const createReReviewMutationHandlers = (recorder: AzureReReviewRecorder) => [
	http.patch(
		"https://dev.azure.com/:org/:project/_apis/git/repositories/:repo/pullRequests/:pr/threads/:threadId",
		async ({ params, request }) => {
			const raw = (await request.json()) as Parameters<
				typeof PullRequestThreadsUpdateBody.decode
			>[0];
			const body = PullRequestThreadsUpdateBody.decode(raw);
			const { threadId } = params as { readonly threadId: string };
			const status = nonnull(body.status);
			recorder.patchedThreads.push({
				id: threadId,
				status,
			});
			return HttpResponse.json({
				...getPullRequestThreadsUpdateResponseMock(),
				id: Number(threadId),
				status,
			});
		},
	),
	http.post(
		"https://dev.azure.com/:org/:project/_apis/git/repositories/:repo/pullRequests/:pr/threads",
		async ({ request }) => {
			const raw = (await request.json()) as Parameters<
				typeof PullRequestThreadsCreateBody.decode
			>[0];
			PullRequestThreadsCreateBody.decode(raw);
			recorder.createdThreads.push(1);
			return HttpResponse.json({
				...getPullRequestThreadsCreateResponseMock(),
				id: BASE_CREATED_THREAD_ID + recorder.createdThreads.length,
			});
		},
	),
];

function createAzureReReviewHandlers(
	repo: ScenarioRepo,
	recorder: AzureReReviewRecorder,
) {
	const baseAzure = getPullRequestsGetPullRequestResponseMock({
		pullRequestId: 42,
		title: "Update helper",
		description: "Re-review body",
		mergeStatus: "succeeded",
		sourceRefName: "refs/heads/feature-v2",
		targetRefName: "refs/heads/main",
	});
	return [
		getPullRequestsGetPullRequestMockHandler({
			...baseAzure,
			createdBy: { ...baseAzure.createdBy, uniqueName: "author@example.com" },
			lastMergeTargetCommit: {
				...baseAzure.lastMergeTargetCommit,
				commitId: repo.baseCommit,
			},
			lastMergeSourceCommit: {
				...baseAzure.lastMergeSourceCommit,
				commitId: repo.headCommitV2,
			},
			repository: {
				project: {
					id: "00000000-0000-0000-0000-000000000000",
				},
			},
		}),
		createReReviewThreadsHandler(repo),
		...createReReviewMutationHandlers(recorder),
	];
}

export { type AzureReReviewRecorder, createAzureReReviewHandlers };
