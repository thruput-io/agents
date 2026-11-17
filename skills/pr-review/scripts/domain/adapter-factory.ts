import { z } from "zod";
import type { AccessToken } from "./access-token.ts";
import type { HostAdapter } from "./adapter.ts";
import { AzureDevOpsAdapter } from "./azure-adapter.ts";
import {
	AzureMergeRequest,
	type CodeUnderReview,
	GitDiff,
	GithubPullRequest,
} from "./code-under-review.ts";
import { GitAdapter } from "./git-adapter.ts";
import { GitHubAdapter } from "./github-adapter.ts";
import { TargetSchema } from "./host.ts";
import type { PersistedPullRequest } from "./ledger-directory.ts";
import { nonnull } from "./nullish.ts";

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
		return defaultSchema.safeDecode(url);
	},
	fromWithToken(
		url: string,
		token: AccessToken,
	): z.ZodSafeParseResult<HostAdapter> {
		return withTokenSchema(token).safeDecode(url);
	},
	rehydrate(persisted: PersistedPullRequest): {
		readonly pullRequest: CodeUnderReview;
		readonly adapter: HostAdapter;
	} {
		const { host } = persisted.change;
		if (host.kind === "github") {
			const pullRequest = nonnull(GithubPullRequest.from(host).data).withReview(
				persisted.surface.files,
				persisted.fragments,
				persisted.threads,
			);
			return { pullRequest, adapter: GitHubAdapter.from(pullRequest) };
		}
		if (host.kind === "azure-devops") {
			const pullRequest = nonnull(AzureMergeRequest.from(host).data).withReview(
				persisted.surface.files,
				persisted.fragments,
				persisted.threads,
			);
			return { pullRequest, adapter: AzureDevOpsAdapter.from(pullRequest) };
		}
		const pullRequest = nonnull(GitDiff.from(host).data).withReview(
			persisted.surface.files,
			persisted.fragments,
			persisted.threads,
		);
		return { pullRequest, adapter: GitAdapter.from(pullRequest) };
	},
	rehydrateWithToken(
		persisted: PersistedPullRequest,
		token: AccessToken,
	): {
		readonly pullRequest: CodeUnderReview;
		readonly adapter: HostAdapter;
	} {
		const { host } = persisted.change;
		if (host.kind === "github") {
			const pullRequest = nonnull(GithubPullRequest.from(host).data).withReview(
				persisted.surface.files,
				persisted.fragments,
				persisted.threads,
			);
			return {
				pullRequest,
				adapter: GitHubAdapter.fromWithToken(pullRequest, token),
			};
		}
		if (host.kind === "azure-devops") {
			const pullRequest = nonnull(AzureMergeRequest.from(host).data).withReview(
				persisted.surface.files,
				persisted.fragments,
				persisted.threads,
			);
			return {
				pullRequest,
				adapter: AzureDevOpsAdapter.fromWithToken(pullRequest, token),
			};
		}
		const pullRequest = nonnull(GitDiff.from(host).data).withReview(
			persisted.surface.files,
			persisted.fragments,
			persisted.threads,
		);
		return { pullRequest, adapter: GitAdapter.from(pullRequest) };
	},
} as const;
