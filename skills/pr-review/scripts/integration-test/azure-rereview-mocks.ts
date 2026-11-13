import { HttpResponse, http } from "msw";
import {
	getPullRequestsGetPullRequestMockHandler,
	getPullRequestsGetPullRequestResponseMock,
	getPullRequestThreadsCreateResponseMock,
	getPullRequestThreadsListMockHandler,
	getPullRequestThreadsListResponseMock,
	getPullRequestThreadsUpdateResponseMock,
} from "../../clients/azure-git.g.ts";
import {
	PullRequestThreadsCreateBody,
	PullRequestThreadsUpdateBody,
} from "../../clients/azure-git.zod.g.ts";
import { nonnull } from "../domain/nullish.ts";
import { SITE } from "../domain/rulebook.ts";
import type { ScenarioRepo } from "./scenario-repo.ts";

export interface AzureReReviewRecorder {
	readonly patchedThreads: Array<{
		readonly id: string;
		readonly status: string;
	}>;
	readonly createdThreads: number[];
}

export function createAzureReReviewHandlers(
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
	const baseAzureRepo = baseAzure.repository ?? {};
	const baseThread = nonnull(getPullRequestThreadsListResponseMock().value[0]);
	const citeYagni = `[You aren't gonna need it](${SITE}#you-arent-gonna-need-it)`;
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
				...baseAzureRepo,
				project: {
					...baseAzureRepo.project,
					id: "00000000-0000-0000-0000-000000000000",
				},
			},
		}),
		getPullRequestThreadsListMockHandler({
			count: 5,
			value: [
				{
					...baseThread,
					id: 90,
					status: "active",
					threadContext: null,
					pullRequestThreadContext: null,
					identities: null,
					comments: [
						{
							content: `**Verdict: request-changes**\n\nNot reviewed at ${repo.headCommit} against [the rules](${SITE}): policy 'Build' is rejected.`,
						},
					],
				},
				{
					...baseThread,
					id: 91,
					status: "active",
					threadContext: null,
					pullRequestThreadContext: null,
					identities: null,
					comments: [
						{
							content: `**Verdict: request-changes**\n\n1 rules probed by 1 probes at ${repo.headCommit} against [the rules](${SITE}): 1 violations`,
						},
					],
				},
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
		}),
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
					id: 200 + recorder.createdThreads.length,
				});
			},
		),
	];
}
