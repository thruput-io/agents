import { z } from "zod";
import {
	PullRequestsGetPullRequestResponse,
	PullRequestThreadsCreateResponse,
} from "../../../clients/azure-git.zod.g.ts";
import { EvaluationsListResponse } from "../../../clients/azure-policy.zod.g.ts";
import {
	type AzureDevOps,
	type Change,
	ChangeSchema,
	type HeadCommit,
	HeadCommitSchema,
	type Summary,
	SummarySchema,
} from "../../domain/contracts.g.ts";

const AzureEvaluationTransportSchema =
	EvaluationsListResponse.shape.value.element;

const orEmpty = (value: string | null | undefined): string => {
	if (value === undefined || value === null) {
		return "";
	}
	return value;
};

const threadIdText = (id: number | null | undefined): string => {
	if (id === undefined || id === null) {
		return "";
	}
	return String(id);
};

const projectIdOf = (
	host: AzureDevOps,
	pullRequest: Pick<AzurePullRequest, "repository">,
): string => {
	const id = pullRequest.repository?.project?.id;
	if (id === undefined || id === null) {
		return host.project;
	}
	return id;
};

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
		decode: (wire) => threadIdText(wire.id),
		encode: (id) => ({ id: Number(id) }),
	},
);

export const headCommitOf = (
	pullRequest: Pick<AzurePullRequest, "lastMergeSourceCommit">,
): HeadCommit =>
	HeadCommitSchema.parse(orEmpty(pullRequest.lastMergeSourceCommit?.commitId));

export const changeOf = (
	host: AzureDevOps,
	pullRequest: Pick<AzurePullRequest, "createdBy" | "description">,
): Change =>
	ChangeSchema.parse({
		host,
		author: orEmpty(pullRequest.createdBy?.uniqueName),
		description: orEmpty(pullRequest.description),
	});

export const artifactIdOf = (
	host: AzureDevOps,
	pullRequest: Pick<AzurePullRequest, "repository">,
): Summary =>
	SummarySchema.parse(
		`vstfs:///CodeReview/CodeReviewId/${projectIdOf(host, pullRequest)}/${host.id}`,
	);

export const targetCommitOf = (
	pullRequest: Pick<AzurePullRequest, "lastMergeTargetCommit">,
): HeadCommit =>
	HeadCommitSchema.parse(orEmpty(pullRequest.lastMergeTargetCommit?.commitId));

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
): Summary[] => {
	const reasons: Summary[] = [];
	if (mergeStatus === "conflicts") {
		reasons.push("pull request has merge conflicts");
	}
	for (const policy of policies) {
		if (policy.status !== "approved") {
			reasons.push(`the blocking Build policy is ${String(policy.status)}`);
		}
	}
	return reasons;
};
