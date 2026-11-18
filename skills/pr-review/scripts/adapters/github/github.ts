import { z } from "zod";
import type { CheckRun, PullRequestReview } from "../../../clients/github.g.ts";
import {
	ChecksListForRefResponse,
	PullsCreateReviewResponse,
	PullsGetResponse,
	type PullsGetResponse as PullsGetResponseType,
	PullsListFilesResponse,
	PullsListReviewsResponse,
} from "../../../clients/github.zod.g.ts";
import type {
	Change,
	GitHub,
	HeadCommit,
	Summary,
} from "../../domain/contracts.g.ts";
import { isNullOrEmpty } from "../../domain/nullish.ts";
import { ours } from "../../domain/rulebook.ts";

const PASSED = new Set(["success", "skipped", "neutral"]);
const PRIOR = / probes at (?<commit>[0-9a-f]{40})\b/u;
const TOTAL_COUNT_KEY = "total_count";
const CHECK_RUNS_KEY = "check_runs";
const GitHubCheckRunTransportSchema =
	ChecksListForRefResponse.shape.check_runs.element;

export const GitHubPullRequestCodec = z.codec(
	PullsGetResponse,
	PullsGetResponse,
	{
		decode: (wire) => wire,
		encode: (pr) => pr,
	},
);

export const GitHubReviewsCodec = z.codec(
	PullsListReviewsResponse,
	PullsListReviewsResponse,
	{
		decode: (wire) => wire,
		encode: (reviews) => reviews,
	},
);

export const GitHubPullFilesCodec = z.codec(
	PullsListFilesResponse,
	PullsListFilesResponse,
	{
		decode: (wire) => wire,
		encode: (files) => files,
	},
);

export const GitHubCreatedReviewCodec = z.codec(
	PullsCreateReviewResponse,
	PullsCreateReviewResponse,
	{
		decode: (wire) => wire,
		encode: (review) => review,
	},
);

export const GitHubCheckRunsCodec = z.codec(
	ChecksListForRefResponse,
	z.array(GitHubCheckRunTransportSchema),
	{
		decode: (wire) => wire.check_runs,
		encode: (checkRuns) => ({
			[TOTAL_COUNT_KEY]: checkRuns.length,
			[CHECK_RUNS_KEY]: checkRuns,
		}),
	},
);

export const headCommitOf = (pullRequest: {
	readonly head: { readonly sha: string };
}): HeadCommit => pullRequest.head.sha;

export const changeOf = (
	host: GitHub,
	pullRequest: Pick<PullsGetResponseType, "user" | "body">,
): Change => ({
	host,
	author: pullRequest.user.login,
	description: pullRequest.body ?? "",
});

export const baseCommitOf = (pullRequest: {
	readonly base: { readonly sha: string };
}): HeadCommit => pullRequest.base.sha;

export const failedChecks = (
	checks: readonly Pick<CheckRun, "name" | "conclusion">[],
): Summary[] =>
	checks
		.filter(
			(check) =>
				isNullOrEmpty(check.conclusion) || !PASSED.has(check.conclusion),
		)
		.map((check) => `check ${check.name} did not succeed`);

export const refusalReasons = (
	mergeable: string | null | undefined,
	failed: readonly Summary[],
): Summary[] => {
	const reasons: Summary[] = [];
	if (mergeable === "dirty") {
		reasons.push("pull request has merge conflicts");
	}
	return [...reasons, ...failed];
};

export function postedAt(
	reviews: readonly Pick<PullRequestReview, "state" | "body" | "html_url">[],
	headCommit: HeadCommit,
): Summary | null {
	return (
		reviews.find(
			(review) =>
				review.state !== "PENDING" &&
				ours(review.body) &&
				review.body.includes(`probes at ${headCommit} `),
		)?.html_url ?? null
	);
}

export function refusedIn(
	reviews: readonly Pick<PullRequestReview, "state" | "body" | "html_url">[],
	headCommit: HeadCommit,
): Summary | null {
	return (
		reviews.find(
			(review) =>
				review.state !== "PENDING" &&
				ours(review.body) &&
				review.body.includes(`Not reviewed at ${headCommit} `),
		)?.html_url ?? null
	);
}

export const priorOf = (
	reviews: readonly Pick<PullRequestReview, "state" | "body">[],
): HeadCommit | null =>
	reviews
		.filter((review) => review.state !== "PENDING" && ours(review.body))
		.map((review) => PRIOR.exec(review.body))
		.filter((match) => !isNullOrEmpty(match))
		.at(-1)?.[1] ?? null;
