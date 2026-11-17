import { GraphQLClient } from "graphql-request";
import { pullsCreateReview, pullsListReviews } from "../../clients/github.g.ts";
import { type HostHttpResponse, isJsonResponse } from "./adapter.ts";
import type {
	GitHub,
	HeadCommit,
	HostError,
	Ledger,
	Outcome,
	Summary,
} from "./contracts.g.ts";
import {
	GitHubCreatedReviewCodec,
	GitHubReviewsCodec,
	postedAt,
} from "./github.ts";
import { payload, refusalPayload } from "./github-review.ts";
import { settleAndReopenGitHubThreads } from "./github-threads.ts";
import { table } from "./ledger-table.ts";
import { isNullOrEmpty } from "./nullish.ts";

const GRAPHQL_URL = "https://api.github.com/graphql";

interface GitHubPostRequest {
	readonly host: GitHub;
	readonly init: { readonly headers: Readonly<Record<string, string>> };
	readonly outcome: Outcome;
	readonly ledger: Ledger;
	readonly onError: (res: HostHttpResponse) => HostError;
}

interface GitHubRefusalRequest {
	readonly host: GitHub;
	readonly init: { readonly headers: Readonly<Record<string, string>> };
	readonly headCommit: HeadCommit;
	readonly reason: Summary;
	readonly onError: (res: HostHttpResponse) => HostError;
}

export async function refuseGitHubReview(
	request: GitHubRefusalRequest,
): Promise<Summary | HostError> {
	const { host, init, headCommit, reason, onError } = request;
	const created = await pullsCreateReview(
		host.owner,
		host.repository,
		host.number,
		refusalPayload(headCommit, reason),
		init,
	);
	if (!isJsonResponse(created)) {
		return onError(created);
	}
	return GitHubCreatedReviewCodec.decode(created.data).html_url;
}

export async function postGitHubReview(
	request: GitHubPostRequest,
): Promise<Summary | HostError> {
	const { host, init, outcome, ledger, onError } = request;
	const reviewsRes = await pullsListReviews(
		host.owner,
		host.repository,
		host.number,
		{},
		init,
	);
	if (!isJsonResponse(reviewsRes)) {
		return onError(reviewsRes);
	}
	const reviews = GitHubReviewsCodec.decode(reviewsRes.data);
	let location = postedAt(reviews, outcome.headCommit);
	if (isNullOrEmpty(location)) {
		const createRes = await pullsCreateReview(
			host.owner,
			host.repository,
			host.number,
			payload(outcome, table(ledger)),
			init,
		);
		if (!isJsonResponse(createRes)) {
			return onError(createRes);
		}
		location = GitHubCreatedReviewCodec.decode(createRes.data).html_url;
	}
	const client = new GraphQLClient(GRAPHQL_URL, init);
	const mutateRes = await settleAndReopenGitHubThreads(
		client,
		outcome.settle,
		outcome.reopen,
	);
	if (!mutateRes.ok) {
		return onError(mutateRes);
	}
	return location;
}
