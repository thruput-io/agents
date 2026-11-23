import { HttpResponse, http } from "msw";
import { nonnull } from "../domain/nullish.ts";
import { SITE } from "../domain/rulebook.ts";
import {
	getItemsListMockHandler,
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
} from "../generated/azure/azure-git.g.ts";
import {
	getEvaluationsListMockHandler,
	getEvaluationsListResponseMock,
} from "../generated/azure/azure-policy.g.ts";
import type { ScenarioRepo } from "./scenario-repo.ts";

const AZURE_REVIEWER_ID = "11111111-2222-3333-4444-555555555555";

function createAzureAlreadyReviewedHandler(headCommit: string) {
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

const createAzurePullRequestHandler = (repo: ScenarioRepo) => {
	const baseAzure = getPullRequestsGetPullRequestResponseMock({
		pullRequestId: 42,
		description: "Refine helper\n\nSecond body.\n\nAdd y export\n\nFirst body.",
		mergeStatus: "succeeded",
		sourceRefName: "refs/heads/feature",
		targetRefName: "refs/heads/main",
	});
	return getPullRequestsGetPullRequestMockHandler({
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
			project: {
				id: "00000000-0000-0000-0000-000000000000",
			},
		},
	});
};

const createApprovedAzureEvaluationsHandler = () => {
	const baseEval = nonnull(getEvaluationsListResponseMock().value[0]);
	return getEvaluationsListMockHandler({
		count: 1,
		value: [
			{
				...baseEval,
				status: "approved",
				configuration: {
					isBlocking: true,
					type: { displayName: "Build" },
				},
			},
		],
	});
};

function createAzureHandlers(repo: ScenarioRepo) {
	return [
		createAzurePullRequestHandler(repo),
		getItemsListMockHandler(({ request }) => {
			const url = new URL(request.url);
			const version = nonnull(
				url.searchParams.get("versionDescriptor.version"),
			);
			return repo.zipForCommit(version);
		}),
		createApprovedAzureEvaluationsHandler(),
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
		http.get("https://dev.azure.com/:organization/_apis/connectionData", () =>
			HttpResponse.json({
				authenticatedUser: { id: AZURE_REVIEWER_ID },
			}),
		),
		http.put(
			"https://dev.azure.com/:organization/:project/_apis/git/repositories/:repositoryId/pullRequests/:pullRequestId/reviewers/:reviewerId",
			({ params }) => {
				const { reviewerId } = params;
				if (String(reviewerId) === AZURE_REVIEWER_ID) {
					return HttpResponse.json({
						...getPullRequestReviewersCreatePullRequestReviewerResponseMock(),
						id: AZURE_REVIEWER_ID,
						vote: 10,
					});
				}
				return HttpResponse.json(
					{
						message: `Invalid argument value.\r\nParameter name: The identity ${String(reviewerId)} is not recognized.`,
					},
					{ status: 400 },
				);
			},
		),
	];
}

export {
	AZURE_REVIEWER_ID,
	createAzureAlreadyReviewedHandler,
	createAzureHandlers,
};
