import type {
	HeadCommit,
	HostError,
	Ledger,
	Outcome,
	Summary,
} from "../../domain/contracts.g.ts";
import { table } from "../../domain/ledger-table.ts";
import { isNullOrEmpty } from "../../domain/nullish.ts";
import { pullRequestThreadsList } from "../../generated/azure/azure-git.g.ts";
import { isJsonResponse } from "../http-transport.ts";
import {
	API_VERSION,
	type AzurePostContext,
	castAzureVote,
	createAzureThread,
	prArgsOf,
	setAzureThreadStatus,
} from "./azure-client.ts";
import { refusalText, text, threadPayload } from "./azure-review.ts";
import { AzureThreadsListCodec, unposted } from "./azure-threads.ts";

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

export { postAzureReview, refuseAzureReview };
