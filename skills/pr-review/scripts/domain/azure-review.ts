import { z } from "zod";
import {
	CommentCommentType,
	CommentThreadStatus,
	type GitPullRequestCommentThread,
	type IdentityRefWithVote,
} from "../../clients/azure-git.g.ts";
import {
	PullRequestReviewersCreatePullRequestReviewerBody,
	PullRequestThreadsCreateBody,
	PullRequestThreadsUpdateBody,
} from "../../clients/azure-git.zod.g.ts";
import {
	type HeadCommit,
	HeadCommitSchema,
	type InlineFinding,
	InlineFindingSchema,
	type ReviewVerdict,
	ReviewVerdictSchema,
	type Side,
	type Summary,
	SummarySchema,
	type ThreadBody,
	ThreadBodySchema,
} from "./contracts.g.ts";
import { isNullOrEmpty } from "./nullish.ts";
import { SITE } from "./rulebook.ts";

const LEADING_SLASH = /^\//u;
const REFUSAL_PATTERN =
	/^\*\*Verdict: request-changes\*\*\n\nNot reviewed at ([0-9a-f]{40}) against \[the rules\]\([^)]+\): ([\s\S]+)\.$/u;

export const AzureTextThreadCodec = z.codec(
	PullRequestThreadsCreateBody,
	ThreadBodySchema,
	{
		decode: (wire) => wire.comments?.[0]?.content ?? "",
		encode: (content) => ({
			comments: [
				{
					parentCommentId: 0,
					commentType: CommentCommentType.text,
					content,
				},
			],
			status: CommentThreadStatus.active,
		}),
	},
);

export const text = (content: ThreadBody): GitPullRequestCommentThread =>
	AzureTextThreadCodec.encode(content) as GitPullRequestCommentThread;

export const AzureInlineThreadCodec = z.codec(
	PullRequestThreadsCreateBody,
	InlineFindingSchema,
	{
		decode: (wire) => {
			const context = wire.threadContext;
			const side: Side = isNullOrEmpty(context?.rightFileEnd) ? "base" : "head";
			const startPos =
				side === "head" ? context?.rightFileStart : context?.leftFileStart;
			const endLine =
				(side === "head"
					? context?.rightFileEnd?.line
					: context?.leftFileEnd?.line) ?? 1;
			return {
				path: (context?.filePath ?? "").replace(LEADING_SLASH, ""),
				side,
				lines: {
					start: startPos?.line ?? endLine,
					end: endLine,
				},
				body: wire.comments?.[0]?.content ?? "",
			};
		},
		encode: (finding) => {
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
				...AzureTextThreadCodec.encode(finding.body),
				threadContext,
			};
		},
	},
);

export const threadPayload = (
	finding: InlineFinding,
): GitPullRequestCommentThread =>
	AzureInlineThreadCodec.encode(finding) as GitPullRequestCommentThread;

const AzureRefusalThreadCodec = z.codec(
	PullRequestThreadsCreateBody,
	z.object({
		headCommit: HeadCommitSchema,
		reason: SummarySchema,
	}),
	{
		decode: (wire) => {
			const body = wire.comments?.[0]?.content ?? "";
			const match = REFUSAL_PATTERN.exec(body);
			return {
				headCommit: match?.[1] ?? "",
				reason: match?.[2] ?? "",
			};
		},
		encode: ({ headCommit, reason }) =>
			AzureTextThreadCodec.encode(
				`**Verdict: request-changes**\n\nNot reviewed at ${headCommit} against [the rules](${SITE}): ${reason}.`,
			),
	},
);

export const refusalText = (
	headCommit: HeadCommit,
	reason: Summary,
): GitPullRequestCommentThread =>
	AzureRefusalThreadCodec.encode({
		headCommit,
		reason,
	}) as GitPullRequestCommentThread;

export const AzureVoteCodec = z.codec(
	PullRequestReviewersCreatePullRequestReviewerBody,
	ReviewVerdictSchema,
	{
		decode: (wire) => ((wire.vote ?? 0) > 0 ? "approve" : "request-changes"),
		encode: (verdict) => ({
			vote: verdict === "approve" ? 10 : -10,
		}),
	},
);

export const votePayload = (verdict: ReviewVerdict): IdentityRefWithVote =>
	AzureVoteCodec.encode(verdict) as IdentityRefWithVote;

const AzureEditableThreadStatusSchema = z.enum(["active", "closed"]);
export type AzureEditableThreadStatus = z.infer<
	typeof AzureEditableThreadStatusSchema
>;

export const AzureThreadStatusCodec = z.codec(
	PullRequestThreadsUpdateBody,
	AzureEditableThreadStatusSchema,
	{
		decode: (wire) => (wire.status === "closed" ? "closed" : "active"),
		encode: (status) => ({ status }),
	},
);

export const threadStatusPayload = (
	status: AzureEditableThreadStatus,
): GitPullRequestCommentThread =>
	AzureThreadStatusCodec.encode(status) as GitPullRequestCommentThread;
