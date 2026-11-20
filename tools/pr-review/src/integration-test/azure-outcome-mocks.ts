import { HttpResponse, http } from "msw";
import {
	getPullRequestReviewersCreatePullRequestReviewerResponseMock,
	getPullRequestThreadsCreateResponseMock,
} from "../../clients/azure-git.g.ts";
import {
	PullRequestReviewersCreatePullRequestReviewerBody,
	PullRequestThreadsCreateBody,
} from "../../clients/azure-git.zod.g.ts";
import { isNullOrEmpty, nonnull } from "../domain/nullish.ts";
import { AZURE_REVIEWER_ID } from "./azure-mocks.ts";

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

export { type AzureOutcomeRecorder, createAzureOutcomeRecorderHandlers };
