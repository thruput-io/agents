import { z } from "zod";
import {
	type GitPullRequestCommentThread,
	pullRequestReviewersCreatePullRequestReviewer,
	pullRequestThreadsCreate,
	pullRequestThreadsUpdate,
} from "../../../clients/azure-git.g.ts";
import type {
	AzureDevOps,
	HostError,
	Outcome,
	Summary,
	ThreadId,
} from "../../domain/contracts.g.ts";
import {
	type HostHttpResponse,
	type HostTransport,
	HTTP_MULTIPLE_CHOICES,
	HTTP_NON_AUTHORITATIVE,
	HTTP_OK,
	isJsonResponse,
} from "../http-transport.ts";
import { AzureCreatedThreadIdCodec } from "./azure.ts";
import {
	type AzureEditableThreadStatus,
	threadStatusPayload,
	votePayload,
} from "./azure-review.ts";

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

export type { AzurePostContext };
export {
	API_VERSION,
	castAzureVote,
	createAzureThread,
	isWritePermitted,
	prArgsOf,
	resolveAzureReviewerId,
	setAzureThreadStatus,
};
