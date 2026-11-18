import { z } from "zod";
import type { AccessToken } from "../domain/access-token.ts";
import {
	type CodeUnderReview,
	GithubPullRequest,
} from "../domain/code-under-review.ts";
import type { PersistedPullRequest } from "../domain/contracts.g.ts";
import { TargetSchema } from "../domain/host.ts";
import type { HostAdapter } from "../domain/host-adapter.ts";
import { nonnull } from "../domain/nullish.ts";
import { AzureDevOpsAdapter } from "./azure/azure-adapter.ts";
import { AzureMergeRequest } from "./azure/azure-merge-request.ts";
import { GitAdapter } from "./git/git-adapter.ts";
import { GitDiff } from "./git/git-diff.ts";
import { GitHubAdapter } from "./github/github-adapter.ts";

const defaultSchema = TargetSchema.pipe(
	z.union([
		GithubPullRequest.SCHEMA.transform(
			(review): HostAdapter => GitHubAdapter.from(review),
		),
		AzureMergeRequest.SCHEMA.transform(
			(review): HostAdapter => AzureDevOpsAdapter.from(review),
		),
		GitDiff.SCHEMA.transform((review): HostAdapter => GitAdapter.from(review)),
	]),
);

const withTokenSchema = (token: AccessToken) =>
	TargetSchema.pipe(
		z.union([
			GithubPullRequest.SCHEMA.transform(
				(review): HostAdapter => GitHubAdapter.fromWithToken(review, token),
			),
			AzureMergeRequest.SCHEMA.transform(
				(review): HostAdapter =>
					AzureDevOpsAdapter.fromWithToken(review, token),
			),
			GitDiff.SCHEMA.transform(
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
