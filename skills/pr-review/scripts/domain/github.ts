import { z } from "zod";
import type {
	CheckRun,
	PullRequest,
	PullRequestReview,
} from "../../clients/github.g.ts";
import {
	ChecksListForRefResponse,
	PullsCreateReviewResponse,
	PullsGetResponse,
	type PullsGetResponse as PullsGetResponseType,
	PullsListReviewsResponse,
} from "../../clients/github.zod.g.ts";
import type {
	Change,
	GitHub,
	HeadCommit,
	RepositoryPath,
	Summary,
} from "./contracts.g.ts";
import { isNullOrEmpty } from "./nullish.ts";
import { ours } from "./rulebook.ts";

const PASSED = new Set(["success", "skipped", "neutral"]);
const PRIOR = / probes at ([0-9a-f]{40})\b/u;

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

export const GitHubCreatedReviewCodec = z.codec(
	PullsCreateReviewResponse,
	PullsCreateReviewResponse,
	{
		decode: (wire) => wire,
		encode: (review) => review,
	},
);

const GitHubCheckRunTransportSchema =
	ChecksListForRefResponse.shape.check_runs.element;

export const GitHubCheckRunsCodec = z.codec(
	ChecksListForRefResponse,
	z.array(GitHubCheckRunTransportSchema),
	{
		decode: (wire) => wire.check_runs,
		encode: (checkRuns) => ({
			total_count: checkRuns.length,
			check_runs: checkRuns,
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

export const remoteUrlOf = (
	host: GitHub,
	pullRequest: {
		readonly head: {
			readonly repo: Pick<PullRequest["head"]["repo"], "clone_url"> | null;
		};
	},
): RepositoryPath =>
	pullRequest.head.repo?.clone_url ??
	`https://github.com/${host.owner}/${host.repository}.git`;

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
): Summary[] => [
	...(mergeable === "dirty" ? ["pull request has merge conflicts"] : []),
	...failed,
];

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
