import { z } from "zod";
import {
	PullRequestsGetPullRequestResponse,
	PullRequestThreadsCreateResponse,
} from "../../clients/azure-git.zod.g.ts";
import { EvaluationsListResponse } from "../../clients/azure-policy.zod.g.ts";
import {
	type AzureDevOps,
	type Change,
	type HeadCommit,
	type RepositoryPath,
	type Summary,
	SummarySchema,
} from "./contracts.g.ts";

export const KIND = "azure-devops" as const;

export type AzurePullRequest = z.infer<
	typeof PullRequestsGetPullRequestResponse
>;

export const AzurePullRequestCodec = z.codec(
	PullRequestsGetPullRequestResponse,
	PullRequestsGetPullRequestResponse,
	{
		decode: (wire) => wire,
		encode: (pr) => pr,
	},
);

const AzureEvaluationTransportSchema =
	EvaluationsListResponse.shape.value.element;

export type AzureEvaluationRecord = z.infer<
	typeof AzureEvaluationTransportSchema
>;

export const AzureEvaluationsListCodec = z.codec(
	EvaluationsListResponse,
	z.array(AzureEvaluationTransportSchema),
	{
		decode: (wire) => wire.value,
		encode: (value) => ({ count: value.length, value }),
	},
);

export const AzureCreatedThreadIdCodec = z.codec(
	PullRequestThreadsCreateResponse,
	SummarySchema,
	{
		decode: (wire) => String(wire.id ?? ""),
		encode: (id) => ({ id: Number(id) }),
	},
);

export const headCommitOf = (
	pullRequest: Pick<AzurePullRequest, "lastMergeSourceCommit">,
): HeadCommit => pullRequest.lastMergeSourceCommit?.commitId ?? "";

export const changeOf = (
	host: AzureDevOps,
	pullRequest: Pick<AzurePullRequest, "createdBy" | "description">,
): Change => ({
	host,
	author: pullRequest.createdBy?.uniqueName ?? "",
	description: pullRequest.description ?? "",
});

export const artifactIdOf = (
	host: AzureDevOps,
	pullRequest: Pick<AzurePullRequest, "repository">,
): Summary =>
	`vstfs:///CodeReview/CodeReviewId/${pullRequest.repository?.project?.id ?? host.project}/${host.id}`;

export const remoteUrlOf = (
	host: AzureDevOps,
	pullRequest: Pick<AzurePullRequest, "repository">,
): RepositoryPath =>
	pullRequest.repository?.remoteUrl ??
	`https://dev.azure.com/${host.organization}/${host.project}/_git/${host.repository}`;

export const blockingBuildPolicies = (
	policies: readonly Pick<AzureEvaluationRecord, "status" | "configuration">[],
): Pick<AzureEvaluationRecord, "status" | "configuration">[] =>
	policies.filter(
		(policy) =>
			Boolean(policy.configuration?.isBlocking) &&
			policy.configuration?.type?.displayName === "Build",
	);

export const refusalReasons = (
	mergeStatus: string | null | undefined,
	policies: readonly Pick<AzureEvaluationRecord, "status">[],
): Summary[] => [
	...(mergeStatus === "conflicts" ? ["pull request has merge conflicts"] : []),
	...policies
		.filter((policy) => policy.status !== "approved")
		.map((policy) => `the blocking Build policy is ${String(policy.status)}`),
];
