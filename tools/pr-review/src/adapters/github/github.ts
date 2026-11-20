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
import {
	type Change,
	ChangeSchema,
	type GitHub,
	type HeadCommit,
	HeadCommitSchema,
	PathSchema,
	type Summary,
} from "../../domain/contracts.g.ts";
import { isNullOrEmpty } from "../../domain/nullish.ts";
import { ours } from "../../domain/rulebook.ts";

const PASSED = new Set(["success", "skipped", "neutral"]);
const PRIOR = / probes at (?<commit>[0-9a-f]{40})\b/u;
const TOTAL_COUNT_KEY = "total_count";
const CHECK_RUNS_KEY = "check_runs";
const BLOB_URL_KEY = "blob_url";
const RAW_URL_KEY = "raw_url";
const CONTENTS_URL_KEY = "contents_url";
const GitHubCheckRunTransportSchema =
	ChecksListForRefResponse.shape.check_runs.element;

const FileLineCountSchema = z.object({
	path: PathSchema,
	lines: z.number().int().min(0),
	added: z.number().int().min(0),
	deleted: z.number().int().min(0),
});

const stringOrEmpty = (value: string | null | undefined): string => {
	if (isNullOrEmpty(value)) {
		return "";
	}
	return value;
};

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
	z.array(FileLineCountSchema),
	{
		decode: (wire) =>
			wire.map((file) => ({
				path: file.filename,
				lines: file.additions,
				added: file.additions,
				deleted: file.deletions,
			})),
		encode: (files) =>
			files.map((file) => ({
				sha: "",
				filename: file.path,
				status: "modified" as const,
				additions: file.added,
				deletions: file.deleted,
				changes: file.added + file.deleted,
				[BLOB_URL_KEY]: "https://api.github.com",
				[RAW_URL_KEY]: "https://api.github.com",
				[CONTENTS_URL_KEY]: "https://api.github.com",
			})),
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
}): HeadCommit => HeadCommitSchema.parse(pullRequest.head.sha);

export const changeOf = (
	host: GitHub,
	pullRequest: Pick<PullsGetResponseType, "user" | "body">,
): Change =>
	ChangeSchema.parse({
		host,
		author: pullRequest.user.login,
		description: stringOrEmpty(pullRequest.body),
	});

export const baseCommitOf = (pullRequest: {
	readonly base: { readonly sha: string };
}): HeadCommit => HeadCommitSchema.parse(pullRequest.base.sha);

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
	const match = reviews.find(
		(review) =>
			review.state !== "PENDING" &&
			ours(review.body) &&
			review.body.includes(`probes at ${headCommit} `),
	);
	if (match === undefined) {
		return null;
	}
	return match.html_url;
}

export function refusedIn(
	reviews: readonly Pick<PullRequestReview, "state" | "body" | "html_url">[],
	headCommit: HeadCommit,
): Summary | null {
	const match = reviews.find(
		(review) =>
			review.state !== "PENDING" &&
			ours(review.body) &&
			review.body.includes(`Not reviewed at ${headCommit} `),
	);
	if (match === undefined) {
		return null;
	}
	return match.html_url;
}

export const priorOf = (
	reviews: readonly Pick<PullRequestReview, "state" | "body">[],
): HeadCommit | null => {
	const latest = reviews
		.filter((review) => review.state !== "PENDING" && ours(review.body))
		.map((review) => PRIOR.exec(review.body))
		.filter((match) => !isNullOrEmpty(match))
		.at(-1);
	if (latest === undefined || latest === null) {
		return null;
	}
	const [, commit] = latest;
	if (commit === undefined) {
		return null;
	}
	return commit;
};
