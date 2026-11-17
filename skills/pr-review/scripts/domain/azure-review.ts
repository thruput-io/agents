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
	decodeAzureThreadContext,
	encodeAzureThreadContext,
} from "./azure-thread-context.ts";
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

const AZURE_VOTE_APPROVED = 10;
const AZURE_VOTE_REJECTED = -10;
const AZURE_VOTE_BY_VERDICT: Readonly<Record<ReviewVerdict, number>> = {
	approve: AZURE_VOTE_APPROVED,
	"request-changes": AZURE_VOTE_REJECTED,
};
const EDITABLE_STATUS_BY_WIRE: Readonly<
	Record<string, AzureEditableThreadStatus>
> = {
	closed: "closed",
	active: "active",
};
const REFUSAL_PATTERN =
	/^\*\*Verdict: request-changes\*\*\n\nNot reviewed at (?<commit>[0-9a-f]{40}) against \[the rules\]\([^)]+\): (?<reason>[\s\S]+)\.$/u;

const AzureTextThreadCodec = z.codec(
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

const text = (content: ThreadBody): GitPullRequestCommentThread =>
	AzureTextThreadCodec.encode(content) as GitPullRequestCommentThread;

const AzureInlineThreadCodec = z.codec(
	PullRequestThreadsCreateBody,
	InlineFindingSchema,
	{
		decode: (wire) => ({
			...decodeAzureThreadContext(wire.threadContext),
			body: wire.comments?.[0]?.content ?? "",
		}),
		encode: (finding) => ({
			...AzureTextThreadCodec.encode(finding.body),
			threadContext: encodeAzureThreadContext(
				finding.path,
				finding.side,
				finding.lines,
			),
		}),
	},
);

const threadPayload = (finding: InlineFinding): GitPullRequestCommentThread =>
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

const AzureEditableThreadStatusSchema = z.enum(["active", "closed"]);

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
		decode: (wire) => {
			if ((wire.vote ?? 0) > 0) {
				return "approve";
			}
			return "request-changes";
		},
		encode: (verdict) => ({
			vote: AZURE_VOTE_BY_VERDICT[verdict],
		}),
	},
);

export const votePayload = (verdict: ReviewVerdict): IdentityRefWithVote =>
	AzureVoteCodec.encode(verdict) as IdentityRefWithVote;

export type AzureEditableThreadStatus = z.infer<
	typeof AzureEditableThreadStatusSchema
>;

export const AzureThreadStatusCodec = z.codec(
	PullRequestThreadsUpdateBody,
	AzureEditableThreadStatusSchema,
	{
		decode: (wire) => EDITABLE_STATUS_BY_WIRE[wire.status ?? ""] ?? "active",
		encode: (status) => ({ status }),
	},
);

export const threadStatusPayload = (
	status: AzureEditableThreadStatus,
): GitPullRequestCommentThread =>
	AzureThreadStatusCodec.encode(status) as GitPullRequestCommentThread;

export { AzureInlineThreadCodec, AzureTextThreadCodec, text, threadPayload };
