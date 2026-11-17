import { z } from "zod";
import {
	type GitPullRequestCommentThread,
	pullRequestReviewersCreatePullRequestReviewer,
	pullRequestThreadsCreate,
	pullRequestThreadsList,
	pullRequestThreadsUpdate,
} from "../../clients/azure-git.g.ts";
import {
	type HostHttpResponse,
	type HostTransport,
	HTTP_MULTIPLE_CHOICES,
	HTTP_NON_AUTHORITATIVE,
	HTTP_OK,
	isJsonResponse,
} from "../adapters/http-transport.ts";
import { AzureCreatedThreadIdCodec } from "./azure.ts";
import {
	type AzureEditableThreadStatus,
	refusalText,
	text,
	threadPayload,
	threadStatusPayload,
	votePayload,
} from "./azure-review.ts";
import { AzureThreadsListCodec, unposted } from "./azure-threads.ts";
import type {
	AzureDevOps,
	HeadCommit,
	HostError,
	Ledger,
	Outcome,
	Summary,
	ThreadId,
} from "./contracts.g.ts";
import { table } from "./ledger-table.ts";
import { isNullOrEmpty } from "./nullish.ts";

const API_VERSION = { "api-version": "7.1" } as const;
const CONNECTION_DATA_VERSION = "7.1-preview.1";
const ConnectionDataSchema = z.object({
	authenticatedUser: z.object({ id: z.string().min(1) }),
});

const isWritePermitted = (res: { readonly status: number }): boolean =>
	res.status >= HTTP_OK &&
	res.status < HTTP_MULTIPLE_CHOICES &&
	res.status !== HTTP_NON_AUTHORITATIVE;

interface AzurePostContext {
	readonly host: AzureDevOps;
	readonly init: ReturnType<HostTransport["requestInit"]>;
	readonly onError: (res: HostHttpResponse) => HostError;
}

const prArgsOf = (
	host: AzureDevOps,
): readonly [string, string, string, number] => [
	host.organization,
	host.project,
	host.repository,
	host.id,
];

const setAzureThreadStatus = async (
	ctx: AzurePostContext,
	tid: ThreadId,
	status: AzureEditableThreadStatus,
): Promise<HostError | null> => {
	const res = await pullRequestThreadsUpdate(
		...prArgsOf(ctx.host),
		Number(tid),
		threadStatusPayload(status),
		API_VERSION,
		ctx.init,
	);
	if (isWritePermitted(res)) {
		return null;
	}
	return ctx.onError(res);
};

const createAzureThread = async (
	ctx: AzurePostContext,
	payload: GitPullRequestCommentThread,
): Promise<Summary | HostError> => {
	const res = await pullRequestThreadsCreate(
		...prArgsOf(ctx.host),
		payload,
		API_VERSION,
		ctx.init,
	);
	if (!isJsonResponse(res)) {
		return ctx.onError(res);
	}
	return AzureCreatedThreadIdCodec.decode(res.data);
};

const resolveAzureReviewerId = async (
	ctx: AzurePostContext,
): Promise<string | HostError> => {
	const url = `https://dev.azure.com/${encodeURIComponent(ctx.host.organization)}/_apis/connectionData?api-version=${CONNECTION_DATA_VERSION}`;
	const res = await fetch(url, ctx.init);
	const data: unknown = await res.json().catch(() => null);
	const httpRes = { status: res.status, headers: res.headers, data };
	if (!isJsonResponse(httpRes)) {
		return ctx.onError(httpRes);
	}
	const parsed = ConnectionDataSchema.safeParse(data);
	if (!parsed.success) {
		return ctx.onError(httpRes);
	}
	return parsed.data.authenticatedUser.id;
};

const castAzureVote = async (
	ctx: AzurePostContext,
	reviewerId: string,
	verdict: Outcome["verdict"],
): Promise<HostError | null> => {
	const res = await pullRequestReviewersCreatePullRequestReviewer(
		...prArgsOf(ctx.host),
		reviewerId,
		votePayload(verdict),
		API_VERSION,
		ctx.init,
	);
	if (isWritePermitted(res)) {
		return null;
	}
	return ctx.onError(res);
};

const refuseAzureReview = async (
	ctx: AzurePostContext,
	reviewerId: string,
	headCommit: HeadCommit,
	reason: Summary,
): Promise<Summary | HostError> => {
	const threadId = await createAzureThread(
		ctx,
		refusalText(headCommit, reason),
	);
	if (typeof threadId !== "string") {
		return threadId;
	}
	const voteErr = await castAzureVote(ctx, reviewerId, "request-changes");
	if (!isNullOrEmpty(voteErr)) {
		return voteErr;
	}
	return threadId;
};

const postAzureReview = async (
	ctx: AzurePostContext,
	reviewerId: string,
	outcome: Outcome,
	ledger: Ledger,
): Promise<Summary | HostError> => {
	const res = await pullRequestThreadsList(
		...prArgsOf(ctx.host),
		API_VERSION,
		ctx.init,
	);
	if (!isJsonResponse(res)) {
		return ctx.onError(res);
	}
	const rawThreads = AzureThreadsListCodec.decode(res.data);
	const pending = unposted(outcome, rawThreads);
	const inlineResults = await Promise.all(
		pending.inline.map((f) => createAzureThread(ctx, threadPayload(f))),
	);
	const inlineError = inlineResults.find(
		(item): item is HostError => typeof item !== "string",
	);
	if (!isNullOrEmpty(inlineError)) {
		return inlineError;
	}
	const statusResults = await Promise.all([
		...pending.settle.map((id) => setAzureThreadStatus(ctx, id, "closed")),
		...outcome.reopen.map((id) => setAzureThreadStatus(ctx, id, "active")),
	]);
	const statusError = statusResults.find((err) => !isNullOrEmpty(err));
	if (!isNullOrEmpty(statusError)) {
		return statusError;
	}
	const body = text([outcome.summary, table(ledger)].join("\n\n"));
	let summaryId: Summary | HostError = String(ctx.host.id);
	if (pending.summary) {
		summaryId = await createAzureThread(ctx, body);
	}
	if (typeof summaryId !== "string") {
		return summaryId;
	}
	const voteErr = await castAzureVote(ctx, reviewerId, outcome.verdict);
	if (!isNullOrEmpty(voteErr)) {
		return voteErr;
	}
	return summaryId;
};

export type { AzurePostContext };
export {
	isWritePermitted,
	postAzureReview,
	refuseAzureReview,
	resolveAzureReviewerId,
	setAzureThreadStatus,
};
