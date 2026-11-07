import { z } from "zod";
import {
	CommentCommentType,
	CommentThreadStatus,
	type GitPullRequestCommentThread,
	type IdentityRefWithVote,
} from "../../clients/azure-git.g.ts";
import {
	type HeadCommit,
	HeadCommitSchema,
	type InlineFinding,
	InlineFindingSchema,
	type ReviewVerdict,
	ReviewVerdictSchema,
	type Summary,
	SummarySchema,
	type ThreadBody,
	ThreadBodySchema,
} from "./contracts.g.ts";
import { SITE } from "./rulebook.ts";

const AzureTextThreadSchema = ThreadBodySchema.transform(
	(content): GitPullRequestCommentThread => ({
		comments: [
			{
				parentCommentId: 0,
				commentType: CommentCommentType.text,
				content,
			},
		],
		status: CommentThreadStatus.active,
	}),
);

export const text = (content: ThreadBody): GitPullRequestCommentThread =>
	AzureTextThreadSchema.parse(content);

const AzureInlineThreadSchema = InlineFindingSchema.transform(
	(finding): GitPullRequestCommentThread => {
		const { start, end } = finding.lines;
		const startPosition = { line: start, offset: 1 };
		const endPosition = { line: end, offset: 1 };
		const threadContext =
			finding.side === "head"
				? {
						filePath: `/${finding.path}`,
						rightFileStart: startPosition,
						rightFileEnd: endPosition,
					}
				: {
						filePath: `/${finding.path}`,
						leftFileStart: startPosition,
						leftFileEnd: endPosition,
					};
		return {
			...text(finding.body),
			threadContext,
		};
	},
);

export const threadPayload = (
	finding: InlineFinding,
): GitPullRequestCommentThread => AzureInlineThreadSchema.parse(finding);

const AzureRefusalThreadSchema = z
	.object({
		headCommit: HeadCommitSchema,
		reason: SummarySchema,
	})
	.transform(
		({ headCommit, reason }): GitPullRequestCommentThread =>
			text(
				`**Verdict: request-changes**\n\nNot reviewed at ${headCommit} against [the rules](${SITE}): ${reason}.`,
			),
	);

export const refusalText = (
	headCommit: HeadCommit,
	reason: Summary,
): GitPullRequestCommentThread =>
	AzureRefusalThreadSchema.parse({ headCommit, reason });

const AzureVoteSchema = ReviewVerdictSchema.transform(
	(verdict): IdentityRefWithVote => ({
		vote: verdict === "approve" ? 10 : -10,
	}),
);

export const votePayload = (verdict: ReviewVerdict): IdentityRefWithVote =>
	AzureVoteSchema.parse(verdict);
