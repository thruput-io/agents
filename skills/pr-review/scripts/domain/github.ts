import type {
	CheckRun,
	PullRequest,
	PullRequestReview,
} from "../../clients/github.g.ts";
import {
	type Change,
	ChangeSchema,
	type GitHub,
	type HeadCommit,
	HeadCommitSchema,
	type RepositoryPath,
	RepositoryPathSchema,
	type Summary,
} from "./contracts.g.ts";
import { isNullOrEmpty } from "./nullish.ts";
import { ours } from "./rulebook.ts";

const PASSED = new Set(["success", "skipped", "neutral"]);
const PRIOR = / probes at ([0-9a-f]{40})\b/u;

export const headCommitOf = (pullRequest: {
	readonly head: { readonly sha: string };
}): HeadCommit => HeadCommitSchema.parse(pullRequest.head.sha);

export const changeOf = (
	host: GitHub,
	pullRequest: Pick<PullRequest, "user" | "body">,
): Change =>
	ChangeSchema.parse({
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
	RepositoryPathSchema.parse(
		pullRequest.head.repo?.clone_url ??
			`https://github.com/${host.owner}/${host.repository}.git`,
	);

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
): HeadCommit | null => {
	const raw =
		reviews
			.filter((review) => review.state !== "PENDING" && ours(review.body))
			.map((review) => PRIOR.exec(review.body))
			.filter((match) => !isNullOrEmpty(match))
			.at(-1)?.[1] ?? null;
	return isNullOrEmpty(raw) ? null : HeadCommitSchema.parse(raw);
};
