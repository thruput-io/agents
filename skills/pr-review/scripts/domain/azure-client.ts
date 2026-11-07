import {
	type CommentThreadStatus,
	type GitPullRequest,
	type GitPullRequestCommentThread,
	pullRequestReviewersCreatePullRequestReviewer,
	pullRequestsGetPullRequest,
	pullRequestThreadsCreate,
	pullRequestThreadsList,
	pullRequestThreadsUpdate,
} from "../../clients/azure-git.g.ts";
import {
	evaluationsList,
	type PolicyEvaluationRecord,
} from "../../clients/azure-policy.g.ts";
import type { AccessToken } from "./access-token.ts";
import { artifactIdOf } from "./azure.ts";
import { refusalText, votePayload } from "./azure-review.ts";
import {
	type AzureDevOps,
	type HeadCommit,
	type Outcome,
	type Summary,
	SummarySchema,
	type ThreadId,
} from "./contracts.g.ts";
import { isNullOrEmpty } from "./nullish.ts";

const API_VERSION = { "api-version": "7.1" } as const;
const POLICY_VERSION = "7.1-preview.1";

const requestInitOf = (
	token: AccessToken | null,
): { readonly headers: Readonly<Record<string, string>> } =>
	isNullOrEmpty(token) ? { headers: {} } : token.requestInit();

export async function setAzureThreadStatus(
	host: AzureDevOps,
	token: AccessToken | null,
	threadId: ThreadId,
	status: CommentThreadStatus,
): Promise<void> {
	await pullRequestThreadsUpdate(
		host.organization,
		host.project,
		host.repository,
		host.id,
		Number(threadId),
		{ status },
		API_VERSION,
		requestInitOf(token),
	);
}

export async function createAzureThread(
	host: AzureDevOps,
	token: AccessToken | null,
	payload: GitPullRequestCommentThread,
): Promise<Summary> {
	const res = await pullRequestThreadsCreate(
		host.organization,
		host.project,
		host.repository,
		host.id,
		payload,
		API_VERSION,
		requestInitOf(token),
	);
	return SummarySchema.parse(String(res.data.id));
}

export async function castAzureVote(
	host: AzureDevOps,
	token: AccessToken | null,
	verdict: Outcome["verdict"],
): Promise<void> {
	await pullRequestReviewersCreatePullRequestReviewer(
		host.organization,
		host.project,
		host.repository,
		host.id,
		"me",
		votePayload(verdict),
		API_VERSION,
		requestInitOf(token),
	);
}

export async function refuseAzurePullRequest(
	host: AzureDevOps,
	token: AccessToken | null,
	headCommit: HeadCommit,
	reason: Summary,
): Promise<Summary> {
	const threadId = await createAzureThread(
		host,
		token,
		refusalText(headCommit, reason),
	);
	await castAzureVote(host, token, "request-changes");
	return threadId;
}

export async function listAzureThreads(
	host: AzureDevOps,
	token: AccessToken | null,
): Promise<readonly GitPullRequestCommentThread[]> {
	const res = await pullRequestThreadsList(
		host.organization,
		host.project,
		host.repository,
		host.id,
		API_VERSION,
		requestInitOf(token),
	);
	return res.data;
}

export async function fetchAzurePullRequestState(
	host: AzureDevOps,
	token: AccessToken | null,
): Promise<{
	readonly pr: GitPullRequest;
	readonly evaluations: readonly PolicyEvaluationRecord[];
	readonly rawThreads: readonly GitPullRequestCommentThread[];
}> {
	const init = requestInitOf(token);
	const prRes = await pullRequestsGetPullRequest(
		host.organization,
		host.project,
		host.repository,
		host.id,
		API_VERSION,
		init,
	);
	const pr = prRes.data;
	const [evalRes, rawThreads] = await Promise.all([
		evaluationsList(
			host.organization,
			host.project,
			{
				artifactId: artifactIdOf(host, pr),
				"api-version": POLICY_VERSION,
			},
			init,
		),
		listAzureThreads(host, token),
	]);
	return { pr, evaluations: evalRes.data, rawThreads };
}
