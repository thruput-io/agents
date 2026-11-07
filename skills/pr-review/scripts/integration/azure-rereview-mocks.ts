import { HttpResponse, http } from "msw";
import {
	getPullRequestsGetPullRequestMockHandler,
	getPullRequestsGetPullRequestResponseMock,
	getPullRequestThreadsCreateResponseMock,
	getPullRequestThreadsListMockHandler,
	getPullRequestThreadsUpdateResponseMock,
} from "../../clients/azure-git.g.ts";
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
	const baseAzureRepo = nonnull(baseAzure.repository);
	const citeYagni = `[You aren't gonna need it](${SITE}#you-arent-gonna-need-it)`;
	return [
		getPullRequestsGetPullRequestMockHandler({
			...baseAzure,
			createdBy: { ...baseAzure.createdBy, uniqueName: "author@example.com" },
			lastMergeSourceCommit: {
				...baseAzure.lastMergeSourceCommit,
				commitId: repo.headCommitV2,
			},
			repository: {
				...baseAzureRepo,
				remoteUrl: repo.repoDir,
				project: { ...baseAzureRepo.project, id: "proj-id" },
			},
		}),
		getPullRequestThreadsListMockHandler([
			{
				id: 90,
				status: "active",
				comments: [
					{
						content: `**Verdict: request-changes**\n\nNot reviewed at ${repo.headCommit} against [the rules](${SITE}): policy 'Build' is rejected.`,
					},
				],
			},
			{
				id: 91,
				status: "active",
				comments: [
					{
						content: `**Verdict: request-changes**\n\n1 rules probed by 1 probes at ${repo.headCommit} against [the rules](${SITE}): 1 violations`,
					},
				],
			},
			{
				id: 10,
				status: "active",
				threadContext: {
					filePath: "/service.ts",
					rightFileStart: { line: 2, offset: 1 },
					rightFileEnd: { line: 2, offset: 1 },
				},
				comments: [{ content: `Unused export y breaks ${citeYagni}` }],
			},
			{
				id: 11,
				status: "fixed",
				threadContext: {
					filePath: "/helper.ts",
					rightFileStart: { line: 1, offset: 1 },
					rightFileEnd: { line: 1, offset: 1 },
				},
				comments: [{ content: `Unused export z breaks ${citeYagni}` }],
			},
			{
				id: 12,
				status: "active",
				threadContext: {
					filePath: "/helper.ts",
					rightFileStart: { line: 1, offset: 1 },
					rightFileEnd: { line: 1, offset: 1 },
				},
				comments: [{ content: "Human comment" }],
			},
		]),
		http.patch(
			"https://dev.azure.com/:org/:project/_apis/git/repositories/:repo/pullRequests/:pr/threads/:threadId",
			async ({ params, request }) => {
				const body = (await request.json()) as { readonly status: string };
				const { threadId } = params as { readonly threadId: string };
				recorder.patchedThreads.push({
					id: threadId,
					status: body.status,
				});
				return HttpResponse.json({
					...getPullRequestThreadsUpdateResponseMock(),
					id: Number(threadId),
					status: body.status,
				});
			},
		),
		http.post(
			"https://dev.azure.com/:org/:project/_apis/git/repositories/:repo/pullRequests/:pr/threads",
			() => {
				recorder.createdThreads.push(1);
				return HttpResponse.json({
					...getPullRequestThreadsCreateResponseMock(),
					id: 200 + recorder.createdThreads.length,
				});
			},
		),
	];
}
