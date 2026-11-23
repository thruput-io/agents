import { z } from "zod";
import {
	type HeadCommit,
	HeadCommitSchema,
	type Outcome,
	OutcomeSchema,
	type ReviewVerdict,
	type Summary,
	SummarySchema,
} from "../../domain/contracts.g.ts";
import { SITE } from "../../domain/rulebook.ts";
import {
	type PullsCreateReviewBodyCommentsItem,
	PullsCreateReviewBodyEvent,
	type PullsCreateReviewBody as PullsCreateReviewBodyType,
} from "../../generated/adapters/github/github.g.ts";
import { PullsCreateReviewBody } from "../../generated/adapters/github/github.zod.g.ts";
import { comment, GitHubReviewCommentCodec } from "./github-review-comment.ts";

const EVENT_OF = {
	approve: PullsCreateReviewBodyEvent.APPROVE,
	"request-changes": PullsCreateReviewBodyEvent.REQUEST_CHANGES,
} as const;
const VERDICT_OF = new Map<string, ReviewVerdict>([
	["APPROVE", "approve"],
	["REQUEST_CHANGES", "request-changes"],
]);
const LEDGER_DETAILS_PREFIX = [
	"",
	"",
	"<details>",
	"<summary>Review ledger</summary>",
	"",
	"",
].join("\n");
const LEDGER_DETAILS_SUFFIX = "\n\n</details>";
const REFUSAL_BODY_PATTERN =
	/^\*\*Verdict: request-changes\*\*\n\nNot reviewed at (?<commit>[0-9a-f]{40}) against \[the rules\]\([^)]+\): (?<reason>[\s\S]+)\.$/u;
const COMMIT_ID_KEY = "commit_id";

const stringOrEmpty = (value: string | null | undefined): string => {
	if (value === null || value === undefined) {
		return "";
	}
	return value;
};

const verdictOf = (event: string | undefined): ReviewVerdict => {
	if (event === undefined) {
		return "request-changes";
	}
	const mapped = VERDICT_OF.get(event);
	if (mapped === undefined) {
		return "request-changes";
	}
	return mapped;
};

const commentsOf = (
	comments: readonly PullsCreateReviewBodyCommentsItem[] | undefined,
): readonly PullsCreateReviewBodyCommentsItem[] => {
	if (comments === undefined) {
		return [];
	}
	return comments;
};

const refusalHeadCommitOf = (
	commitId: string | undefined,
	match: RegExpExecArray | null,
): HeadCommit => {
	if (commitId !== undefined) {
		return commitId;
	}
	if (match !== null && match[1] !== undefined) {
		return match[1];
	}
	return "";
};

const refusalReasonOf = (match: RegExpExecArray | null): Summary => {
	if (match !== null && match[2] !== undefined) {
		return match[2];
	}
	return "";
};

const GitHubReviewPayloadCodec = z.codec(
	PullsCreateReviewBody,
	z.object({
		outcome: OutcomeSchema,
		ledgerTable: SummarySchema.or(z.literal("")),
	}),
	{
		decode: (wire) => {
			const rawBody = stringOrEmpty(wire.body);
			const splitIndex = rawBody.indexOf(LEDGER_DETAILS_PREFIX);
			let summary = rawBody;
			let ledgerTable = "";
			if (splitIndex >= 0) {
				summary = rawBody.slice(0, splitIndex);
				if (rawBody.endsWith(LEDGER_DETAILS_SUFFIX)) {
					ledgerTable = rawBody.slice(
						splitIndex + LEDGER_DETAILS_PREFIX.length,
						rawBody.length - LEDGER_DETAILS_SUFFIX.length,
					);
				}
			}
			return {
				outcome: {
					headCommit: stringOrEmpty(wire.commit_id),
					verdict: verdictOf(wire.event),
					summary,
					inline: commentsOf(wire.comments).map((item) =>
						GitHubReviewCommentCodec.decode(item),
					),
					settle: [],
					reopen: [],
				},
				ledgerTable,
			};
		},
		encode: ({ outcome, ledgerTable }) => {
			const body = [
				outcome.summary,
				`<details>\n<summary>Review ledger</summary>\n\n${ledgerTable}\n\n</details>`,
			].join("\n\n");
			return {
				[COMMIT_ID_KEY]: outcome.headCommit,
				event: EVENT_OF[outcome.verdict],
				body,
				comments: outcome.inline.map(comment),
			};
		},
	},
);

const payload = (
	outcome: Outcome,
	ledgerTable: string,
): PullsCreateReviewBodyType =>
	GitHubReviewPayloadCodec.encode({ outcome, ledgerTable });

const GitHubRefusalPayloadCodec = z.codec(
	PullsCreateReviewBody,
	z.object({
		headCommit: HeadCommitSchema,
		reason: SummarySchema,
	}),
	{
		decode: (wire) => {
			const match = REFUSAL_BODY_PATTERN.exec(stringOrEmpty(wire.body));
			return {
				headCommit: refusalHeadCommitOf(wire.commit_id, match),
				reason: refusalReasonOf(match),
			};
		},
		encode: ({ headCommit, reason }) => ({
			[COMMIT_ID_KEY]: headCommit,
			event: PullsCreateReviewBodyEvent.REQUEST_CHANGES,
			body: `**Verdict: request-changes**\n\nNot reviewed at ${headCommit} against [the rules](${SITE}): ${reason}.`,
		}),
	},
);

const refusalPayload = (
	headCommit: HeadCommit,
	reason: Summary,
): PullsCreateReviewBodyType =>
	GitHubRefusalPayloadCodec.encode({ headCommit, reason });

export { GitHubReviewPayloadCodec, payload, refusalPayload };
