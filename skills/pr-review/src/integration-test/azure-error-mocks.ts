import { HttpResponse, http } from "msw";
import {
	getPullRequestThreadsListMockHandler,
	getPullRequestThreadsListResponseMock,
} from "../../clients/azure-git.g.ts";
import {
	getEvaluationsListMockHandler,
	getEvaluationsListResponseMock,
} from "../../clients/azure-policy.g.ts";
import { nonnull } from "../domain/nullish.ts";
import { SITE } from "../domain/rulebook.ts";

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
					typeKey: ["GitPullRequestNotEditable", "Exception"].join(""),
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

export function createFailedAzureConnectionDataHandler() {
	return http.get(
		"https://dev.azure.com/:organization/_apis/connectionData",
		() =>
			HttpResponse.json(
				{
					message:
						"TF400813: The user is not authorized to access this resource.",
				},
				{ status: 403 },
			),
	);
}

export function createRejectedAzurePolicyHandler() {
	const baseEval = nonnull(getEvaluationsListResponseMock().value[0]);
	return getEvaluationsListMockHandler({
		count: 1,
		value: [
			{
				...baseEval,
				status: "rejected",
				configuration: {
					isBlocking: true,
					type: { displayName: "Build" },
				},
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
