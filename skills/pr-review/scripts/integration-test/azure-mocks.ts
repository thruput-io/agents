import { HttpResponse, http } from "msw";
import {
	getItemsListMockHandler,
	getPullRequestReviewersCreatePullRequestReviewerMockHandler,
	getPullRequestReviewersCreatePullRequestReviewerResponseMock,
	getPullRequestReviewersUpdatePullRequestReviewersMockHandler,
	getPullRequestsGetPullRequestMockHandler,
	getPullRequestsGetPullRequestResponseMock,
	getPullRequestThreadsCreateMockHandler,
	getPullRequestThreadsCreateResponseMock,
	getPullRequestThreadsListMockHandler,
	getPullRequestThreadsListResponseMock,
	getPullRequestThreadsUpdateMockHandler,
	getPullRequestThreadsUpdateResponseMock,
} from "../../clients/azure-git.g.ts";
import {
	getEvaluationsListMockHandler,
	getEvaluationsListResponseMock,
} from "../../clients/azure-policy.g.ts";
import { nonnull } from "../domain/nullish.ts";
import { SITE } from "../domain/rulebook.ts";
import type { ScenarioRepo } from "./scenario-repo.ts";

export function createForbiddenHtmlAzureHandler() {
	return http.get(
		"https://dev.azure.com/:organization/:project/_apis/git/repositories/:repositoryId/pullrequests/:pullRequestId",
		() =>
			new HttpResponse("\r\n\r\n<!DOCTYPE html><html>Forbidden</html>", {
				status: 403,
				headers: { "content-type": "text/html; charset=utf-8" },
			}),
	);
}

export function createForbiddenAzureWriteHandler() {
	return http.patch(
		"https://dev.azure.com/:organization/:project/_apis/git/repositories/:repositoryId/pullRequests/:pullRequestId/reviewers",
		() =>
			HttpResponse.json(
				{
					message:
						"TF401027: You need the Git 'PullRequestContribute' permission.",
				},
				{ status: 403 },
			),
	);
}

export function createForbiddenAzureItemsHandler() {
	return http.get(
		"https://dev.azure.com/:organization/:project/_apis/git/repositories/:repositoryId/items",
		() =>
			HttpResponse.json(
				{
					message:
						"TF401019: The Git repository with name or identifier does not exist or you do not have permissions.",
				},
				{ status: 403 },
			),
	);
}

export function createUnwriteableAzurePullRequestHandler() {
	return http.patch(
		"https://dev.azure.com/:organization/:project/_apis/git/repositories/:repositoryId/pullRequests/:pullRequestId/reviewers",
		() =>
			HttpResponse.json(
				{
					$id: "1",
					innerException: null,
					message:
						"TF401181: The pull request cannot be edited due to its state.",
					typeName:
						"Microsoft.TeamFoundation.Git.Server.GitPullRequestNotEditableException, Microsoft.TeamFoundation.Git.Server",
					typeKey: "GitPullRequestNotEditableException",
					errorCode: 0,
					eventId: 3000,
				},
				{ status: 400 },
			),
	);
}

export function createFailedAzureThreadCreateHandler() {
	return http.post(
		"https://dev.azure.com/:organization/:project/_apis/git/repositories/:repositoryId/pullRequests/:pullRequestId/threads",
		() =>
			HttpResponse.json(
				{
					message:
						"TF401181: The pull request cannot be edited due to its state.",
				},
				{ status: 400 },
			),
	);
}

export function createRejectedAzurePolicyHandler() {
	const baseEval = nonnull(getEvaluationsListResponseMock().value[0]);
	const baseConfig = baseEval.configuration ?? {};
	return getEvaluationsListMockHandler({
		count: 1,
		value: [
			{
				...baseEval,
				status: "rejected",
				configuration: {
					...baseConfig,
					isBlocking: true,
					type: { ...baseConfig.type, displayName: "Build" },
				},
			},
		],
	});
}

export function createAzureAlreadyReviewedHandler(headCommit: string) {
	const baseThread = nonnull(getPullRequestThreadsListResponseMock().value[0]);
	return getPullRequestThreadsListMockHandler({
		count: 1,
		value: [
			{
				...baseThread,
				id: 1,
				status: "active",
				threadContext: null,
				pullRequestThreadContext: null,
				identities: null,
				comments: [
					{
						content: `**Verdict: approve**\n\n1 rules probed by 1 probes at ${headCommit} against [the rules](${SITE}): 0 violations`,
					},
				],
			},
		],
	});
}

export function createAzureExistingRefusalHandler(headCommit: string) {
	const baseThread = nonnull(getPullRequestThreadsListResponseMock().value[0]);
	return getPullRequestThreadsListMockHandler({
		count: 1,
		value: [
			{
				...baseThread,
				id: 2,
				status: "active",
				threadContext: null,
				pullRequestThreadContext: null,
				identities: null,
				comments: [
					{
						content: `**Verdict: request-changes**\n\nNot reviewed at ${headCommit} against [the rules](${SITE}): policy 'Build' is rejected.`,
					},
				],
			},
		],
	});
}

export function createAzureHandlers(repo: ScenarioRepo) {
	const baseAzure = getPullRequestsGetPullRequestResponseMock({
		pullRequestId: 42,
		description: "Refine helper\n\nSecond body.\n\nAdd y export\n\nFirst body.",
		mergeStatus: "succeeded",
		sourceRefName: "refs/heads/feature",
		targetRefName: "refs/heads/main",
	});
	const baseAzureRepo = baseAzure.repository ?? {};
	const baseEval = nonnull(getEvaluationsListResponseMock().value[0]);
	const baseEvalConfig = baseEval.configuration ?? {};
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
				commitId: repo.headCommit,
			},
			repository: {
				...baseAzureRepo,
				project: {
					...baseAzureRepo.project,
					id: "00000000-0000-0000-0000-000000000000",
				},
			},
		}),
		getItemsListMockHandler(({ request }) => {
			const url = new URL(request.url);
			const version = nonnull(
				url.searchParams.get("versionDescriptor.version"),
			);
			return repo.zipForCommit(version);
		}),
		getEvaluationsListMockHandler({
			count: 1,
			value: [
				{
					...baseEval,
					status: "approved",
					configuration: {
						...baseEvalConfig,
						isBlocking: true,
						type: { ...baseEvalConfig.type, displayName: "Build" },
					},
				},
			],
		}),
		getPullRequestThreadsListMockHandler({ count: 0, value: [] }),
		getPullRequestThreadsCreateMockHandler({
			...getPullRequestThreadsCreateResponseMock(),
			id: 101,
		}),
		getPullRequestThreadsUpdateMockHandler({
			...getPullRequestThreadsUpdateResponseMock(),
			id: 101,
		}),
		getPullRequestReviewersUpdatePullRequestReviewersMockHandler(),
		getPullRequestReviewersCreatePullRequestReviewerMockHandler({
			...getPullRequestReviewersCreatePullRequestReviewerResponseMock(),
			vote: 10,
		}),
	];
}
