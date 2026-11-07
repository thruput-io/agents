import {
	getPullRequestReviewersCreatePullRequestReviewerMockHandler,
	getPullRequestReviewersCreatePullRequestReviewerResponseMock,
	getPullRequestsGetPullRequestMockHandler,
	getPullRequestsGetPullRequestResponseMock,
	getPullRequestThreadsCreateMockHandler,
	getPullRequestThreadsCreateResponseMock,
	getPullRequestThreadsListMockHandler,
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

export function createRejectedAzurePolicyHandler() {
	const baseEval = nonnull(getEvaluationsListResponseMock()[0]);
	const baseConfig = nonnull(baseEval.configuration);
	return getEvaluationsListMockHandler([
		{
			...baseEval,
			status: "rejected",
			configuration: {
				...baseConfig,
				isBlocking: true,
				type: { ...baseConfig.type, displayName: "Build" },
			},
		},
	]);
}

export function createAzureAlreadyReviewedHandler(headCommit: string) {
	return getPullRequestThreadsListMockHandler([
		{
			id: 1,
			status: "active",
			comments: [
				{
					content: `**Verdict: approve**\n\n1 rules probed by 1 probes at ${headCommit} against [the rules](${SITE}): 0 violations`,
				},
			],
		},
	]);
}

export function createAzureExistingRefusalHandler(headCommit: string) {
	return getPullRequestThreadsListMockHandler([
		{
			id: 2,
			status: "active",
			comments: [
				{
					content: `**Verdict: request-changes**\n\nNot reviewed at ${headCommit} against [the rules](${SITE}): policy 'Build' is rejected.`,
				},
			],
		},
	]);
}

export function createAzureHandlers(repo: ScenarioRepo) {
	const baseAzure = getPullRequestsGetPullRequestResponseMock({
		pullRequestId: 42,
		description: "Refine helper\n\nSecond body.\n\nAdd y export\n\nFirst body.",
		mergeStatus: "succeeded",
		sourceRefName: "refs/heads/feature",
		targetRefName: "refs/heads/main",
	});
	const baseAzureRepo = nonnull(baseAzure.repository);
	const baseEval = nonnull(getEvaluationsListResponseMock()[0]);
	const baseEvalConfig = nonnull(baseEval.configuration);
	return [
		getPullRequestsGetPullRequestMockHandler({
			...baseAzure,
			createdBy: { ...baseAzure.createdBy, uniqueName: "author@example.com" },
			lastMergeSourceCommit: {
				...baseAzure.lastMergeSourceCommit,
				commitId: repo.headCommit,
			},
			repository: {
				...baseAzureRepo,
				remoteUrl: repo.repoDir,
				project: { ...baseAzureRepo.project, id: "proj-id" },
			},
		}),
		getEvaluationsListMockHandler([
			{
				...baseEval,
				status: "approved",
				configuration: {
					...baseEvalConfig,
					isBlocking: true,
					type: { ...baseEvalConfig.type, displayName: "Build" },
				},
			},
		]),
		getPullRequestThreadsListMockHandler([]),
		getPullRequestThreadsCreateMockHandler({
			...getPullRequestThreadsCreateResponseMock(),
			id: 101,
		}),
		getPullRequestThreadsUpdateMockHandler({
			...getPullRequestThreadsUpdateResponseMock(),
			id: 101,
		}),
		getPullRequestReviewersCreatePullRequestReviewerMockHandler({
			...getPullRequestReviewersCreatePullRequestReviewerResponseMock(),
			vote: 10,
		}),
	];
}
