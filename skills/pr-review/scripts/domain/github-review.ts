import { z } from "zod";
import {
	type PullsCreateReviewBodyCommentsItem,
	PullsCreateReviewBodyEvent,
	type PullsCreateReviewBody as PullsCreateReviewBodyType,
} from "../../clients/github.g.ts";
import { PullsCreateReviewBody } from "../../clients/github.zod.g.ts";
import {
	type HeadCommit,
	HeadCommitSchema,
	type InlineFinding,
	InlineFindingSchema,
	type Outcome,
	OutcomeSchema,
	type ReviewVerdict,
	type Side,
	type Summary,
	SummarySchema,
} from "./contracts.g.ts";
import { SITE } from "./rulebook.ts";

const HOST_SIDE_OF = { head: "RIGHT", base: "LEFT" } as const;
const DOMAIN_SIDE_OF: Readonly<Record<string, Side>> = {
	RIGHT: "head",
	LEFT: "base",
};
const EVENT_OF = {
	approve: PullsCreateReviewBodyEvent.APPROVE,
	"request-changes": PullsCreateReviewBodyEvent.REQUEST_CHANGES,
} as const;
const VERDICT_OF: Readonly<Record<string, ReviewVerdict>> = {
	APPROVE: "approve",
	REQUEST_CHANGES: "request-changes",
};
const LEDGER_DETAILS_PREFIX =
	"\n\n<details>\n<summary>Review ledger</summary>\n\n";
const LEDGER_DETAILS_SUFFIX = "\n\n</details>";
const REFUSAL_BODY_PATTERN =
	/^\*\*Verdict: request-changes\*\*\n\nNot reviewed at ([0-9a-f]{40}) against \[the rules\]\([^)]+\): ([\s\S]+)\.$/u;

const GitHubReviewCommentTransportSchema =
	PullsCreateReviewBody.shape.comments.unwrap().element;

export const GitHubReviewCommentCodec = z.codec(
	GitHubReviewCommentTransportSchema,
	InlineFindingSchema,
	{
		decode: (wire) => {
			const end = wire.line ?? 1;
			return {
				path: wire.path,
				side: DOMAIN_SIDE_OF[wire.side ?? "RIGHT"] ?? "head",
				lines: {
					start: wire.start_line ?? end,
					end,
				},
				body: wire.body,
			};
		},
		encode: (finding) => {
			const side = HOST_SIDE_OF[finding.side];
			const { start, end } = finding.lines;
			if (start === end) {
				return { path: finding.path, line: end, side, body: finding.body };
			}
			return {
				path: finding.path,
				start_line: start,
				start_side: side,
				line: end,
				side,
				body: finding.body,
			};
		},
	},
);

export const comment = (
	finding: InlineFinding,
): PullsCreateReviewBodyCommentsItem =>
	GitHubReviewCommentCodec.encode(finding);

export const GitHubReviewPayloadCodec = z.codec(
	PullsCreateReviewBody,
	z.object({
		outcome: OutcomeSchema,
		ledgerTable: SummarySchema.or(z.literal("")),
	}),
	{
		decode: (wire) => {
			const rawBody = wire.body ?? "";
			const splitIndex = rawBody.indexOf(LEDGER_DETAILS_PREFIX);
			const summary = splitIndex >= 0 ? rawBody.slice(0, splitIndex) : rawBody;
			const ledgerTable =
				splitIndex >= 0 && rawBody.endsWith(LEDGER_DETAILS_SUFFIX)
					? rawBody.slice(
							splitIndex + LEDGER_DETAILS_PREFIX.length,
							rawBody.length - LEDGER_DETAILS_SUFFIX.length,
						)
					: "";
			return {
				outcome: {
					headCommit: wire.commit_id ?? "",
					verdict:
						VERDICT_OF[wire.event ?? "REQUEST_CHANGES"] ?? "request-changes",
					summary,
					inline: (wire.comments ?? []).map((item) =>
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
				commit_id: outcome.headCommit,
				event: EVENT_OF[outcome.verdict],
				body,
				comments: outcome.inline.map(comment),
			};
		},
	},
);

export const payload = (
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
			const match = REFUSAL_BODY_PATTERN.exec(wire.body ?? "");
			return {
				headCommit: wire.commit_id ?? match?.[1] ?? "",
				reason: match?.[2] ?? "",
			};
		},
		encode: ({ headCommit, reason }) => ({
			commit_id: headCommit,
			event: PullsCreateReviewBodyEvent.REQUEST_CHANGES,
			body: `**Verdict: request-changes**\n\nNot reviewed at ${headCommit} against [the rules](${SITE}): ${reason}.`,
		}),
	},
);

export const refusalPayload = (
	headCommit: HeadCommit,
	reason: Summary,
): PullsCreateReviewBodyType =>
	GitHubRefusalPayloadCodec.encode({ headCommit, reason });
