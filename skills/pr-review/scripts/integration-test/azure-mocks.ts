import { HttpResponse, http } from "msw";
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
} from "../../clients/azure-git.g.ts";
import {
	PullRequestReviewersCreatePullRequestReviewerBody,
	PullRequestThreadsCreateBody,
} from "../../clients/azure-git.zod.g.ts";
import {
	getEvaluationsListMockHandler,
	getEvaluationsListResponseMock,
} from "../../clients/azure-policy.g.ts";
import { isNullOrEmpty, nonnull } from "../domain/nullish.ts";
import { SITE } from "../domain/rulebook.ts";
import type { ScenarioRepo } from "./scenario-repo.ts";

const AZURE_REVIEWER_ID = "11111111-2222-3333-4444-555555555555";
const BASE_CREATED_THREAD_ID = 100;

interface AzureOutcomeRecorder {
	readonly inlineThreads: Array<{
		readonly filePath: string;
		readonly line: number;
		readonly content: string;
	}>;
	readonly summaryThreads: string[];
	readonly votes: Array<{
		readonly reviewerId: string;
		readonly vote: number;
	}>;
}

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

const createRecordedThreadHandler = (recorder: AzureOutcomeRecorder) =>
	http.post(
		"https://dev.azure.com/:organization/:project/_apis/git/repositories/:repositoryId/pullRequests/:pullRequestId/threads",
		async ({ request }) => {
			const raw = (await request.json()) as Parameters<
				typeof PullRequestThreadsCreateBody.decode
			>[0];
			const decoded = PullRequestThreadsCreateBody.decode(raw);
			const content = nonnull(nonnull(decoded.comments)[0]?.content);
			const context = decoded.threadContext;
			const hasContext = !isNullOrEmpty(context?.filePath);
			if (hasContext) {
				const ctx = nonnull(context);
				recorder.inlineThreads.push({
					filePath: nonnull(ctx.filePath),
					line: nonnull(ctx.rightFileStart?.line),
					content,
				});
			} else {
				recorder.summaryThreads.push(content);
			}
			return HttpResponse.json({
				...getPullRequestThreadsCreateResponseMock(),
				id:
					BASE_CREATED_THREAD_ID +
					recorder.inlineThreads.length +
					recorder.summaryThreads.length,
			});
		},
	);

const createRecordedReviewerHandler = (recorder: AzureOutcomeRecorder) =>
	http.put(
		"https://dev.azure.com/:organization/:project/_apis/git/repositories/:repositoryId/pullRequests/:pullRequestId/reviewers/:reviewerId",
		async ({ params, request }) => {
			const { reviewerId } = params;
			const raw = (await request.json()) as Parameters<
				typeof PullRequestReviewersCreatePullRequestReviewerBody.decode
			>[0];
			const decoded =
				PullRequestReviewersCreatePullRequestReviewerBody.decode(raw);
			const vote = nonnull(decoded.vote);
			recorder.votes.push({
				reviewerId: String(reviewerId),
				vote,
			});
			if (String(reviewerId) === AZURE_REVIEWER_ID) {
				return HttpResponse.json({
					...getPullRequestReviewersCreatePullRequestReviewerResponseMock(),
					id: AZURE_REVIEWER_ID,
					vote,
				});
			}
			return HttpResponse.json(
				{
					message: `Invalid argument value.\r\nParameter name: The identity ${String(reviewerId)} is not recognized.`,
				},
				{ status: 400 },
			);
		},
	);

function createAzureOutcomeRecorderHandlers(recorder: AzureOutcomeRecorder) {
	return [
		createRecordedThreadHandler(recorder),
		createRecordedReviewerHandler(recorder),
	];
}

const createAzurePullRequestHandler = (repo: ScenarioRepo) => {
	const baseAzure = getPullRequestsGetPullRequestResponseMock({
		pullRequestId: 42,
		description: "Refine helper\n\nSecond body.\n\nAdd y export\n\nFirst body.",
		mergeStatus: "succeeded",
		sourceRefName: "refs/heads/feature",
		targetRefName: "refs/heads/main",
	});
	const baseAzureRepo = baseAzure.repository ?? {};
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
			...baseAzureRepo,
			project: {
				...baseAzureRepo.project,
				id: "00000000-0000-0000-0000-000000000000",
			},
		},
	});
};

const createApprovedAzureEvaluationsHandler = () => {
	const baseEval = nonnull(getEvaluationsListResponseMock().value[0]);
	const baseEvalConfig = baseEval.configuration ?? {};
	return getEvaluationsListMockHandler({
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
	type AzureOutcomeRecorder,
	createAzureAlreadyReviewedHandler,
	createAzureHandlers,
	createAzureOutcomeRecorderHandlers,
};
