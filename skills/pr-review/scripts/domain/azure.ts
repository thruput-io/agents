import type { GitPullRequest } from "../../clients/azure-git.g.ts";
import type { PolicyEvaluationRecord } from "../../clients/azure-policy.g.ts";
import {
	type AzureDevOps,
	type Change,
	ChangeSchema,
	type HeadCommit,
	HeadCommitSchema,
	type RepositoryPath,
	RepositoryPathSchema,
	type Summary,
	SummarySchema,
} from "./contracts.g.ts";

export const KIND = "azure-devops" as const;

export const headCommitOf = (
	pullRequest: Pick<GitPullRequest, "lastMergeSourceCommit">,
): HeadCommit =>
	HeadCommitSchema.parse(pullRequest.lastMergeSourceCommit?.commitId ?? "");

export const changeOf = (
	host: AzureDevOps,
	pullRequest: Pick<GitPullRequest, "createdBy" | "description">,
): Change =>
	ChangeSchema.parse({
		host,
		author: pullRequest.createdBy?.uniqueName ?? "",
		description: pullRequest.description ?? "",
	});

export const artifactIdOf = (
	host: AzureDevOps,
	pullRequest: Pick<GitPullRequest, "repository">,
): Summary =>
	SummarySchema.parse(
		`vstfs:///CodeReview/CodeReviewId/${pullRequest.repository?.project?.id ?? host.project}/${host.id}`,
	);

export const remoteUrlOf = (
	host: AzureDevOps,
	pullRequest: Pick<GitPullRequest, "repository">,
): RepositoryPath =>
	RepositoryPathSchema.parse(
		pullRequest.repository?.remoteUrl ??
			`https://dev.azure.com/${host.organization}/${host.project}/_git/${host.repository}`,
	);

export const blockingBuildPolicies = (
	policies: readonly PolicyEvaluationRecord[],
): PolicyEvaluationRecord[] =>
	policies.filter(
		(policy) =>
			Boolean(policy.configuration?.isBlocking) &&
			policy.configuration?.type?.displayName === "Build",
	);

export const refusalReasons = (
	mergeStatus: string | undefined,
	policies: readonly Pick<PolicyEvaluationRecord, "status">[],
): Summary[] => [
	...(mergeStatus === "conflicts" ? ["pull request has merge conflicts"] : []),
	...policies
		.filter((policy) => policy.status !== "approved")
		.map((policy) => `the blocking Build policy is ${String(policy.status)}`),
];
