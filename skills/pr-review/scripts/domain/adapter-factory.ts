import { z } from "zod";
import type { AccessToken } from "./access-token.ts";
import type { HostAdapter } from "./adapter.ts";
import { AzureDevOpsAdapter } from "./azure-adapter.ts";
import {
	AzureMergeRequest,
	GitDiff,
	GithubPullRequest,
} from "./code-under-review.ts";
import { GitAdapter } from "./git-adapter.ts";
import { GitHubAdapter } from "./github-adapter.ts";
import { TargetSchema } from "./host.ts";

const defaultSchema = TargetSchema.pipe(
	z.union([
		GithubPullRequest.Schema.transform(
			(review): HostAdapter => GitHubAdapter.from(review),
		),
		AzureMergeRequest.Schema.transform(
			(review): HostAdapter => AzureDevOpsAdapter.from(review),
		),
		GitDiff.Schema.transform((review): HostAdapter => GitAdapter.from(review)),
	]),
);

const withTokenSchema = (token: AccessToken) =>
	TargetSchema.pipe(
		z.union([
			GithubPullRequest.Schema.transform(
				(review): HostAdapter => GitHubAdapter.fromWithToken(review, token),
			),
			AzureMergeRequest.Schema.transform(
				(review): HostAdapter =>
					AzureDevOpsAdapter.fromWithToken(review, token),
			),
			GitDiff.Schema.transform(
				(review): HostAdapter => GitAdapter.from(review),
			),
		]),
	);

export const HostAdapterFactory = {
	from(url: string): z.ZodSafeParseResult<HostAdapter> {
		return defaultSchema.safeParse(url);
	},
	fromWithToken(
		url: string,
		token: AccessToken,
	): z.ZodSafeParseResult<HostAdapter> {
		return withTokenSchema(token).safeParse(url);
	},
} as const;
