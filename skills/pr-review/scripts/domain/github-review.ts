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
const DOMAIN_SIDE_OF = new Map<string, Side>([
	["RIGHT", "head"],
	["LEFT", "base"],
]);
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
const START_LINE_KEY = "start_line";
const START_SIDE_KEY = "start_side";
const COMMIT_ID_KEY = "commit_id";

const GitHubReviewCommentTransportSchema =
	PullsCreateReviewBody.shape.comments.unwrap().element;

const GitHubReviewCommentCodec = z.codec(
	GitHubReviewCommentTransportSchema,
	InlineFindingSchema,
	{
		decode: (wire) => {
			const end = wire.line ?? 1;
			return {
				path: wire.path,
				side: DOMAIN_SIDE_OF.get(wire.side ?? "RIGHT") ?? "head",
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
				[START_LINE_KEY]: start,
				[START_SIDE_KEY]: side,
				line: end,
				side,
				body: finding.body,
			};
		},
	},
);

const comment = (finding: InlineFinding): PullsCreateReviewBodyCommentsItem =>
	GitHubReviewCommentCodec.encode(finding);

const GitHubReviewPayloadCodec = z.codec(
	PullsCreateReviewBody,
	z.object({
		outcome: OutcomeSchema,
		ledgerTable: SummarySchema.or(z.literal("")),
	}),
	{
		decode: (wire) => {
			const rawBody = wire.body ?? "";
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
					headCommit: wire.commit_id ?? "",
					verdict:
						VERDICT_OF.get(wire.event ?? "REQUEST_CHANGES") ??
						"request-changes",
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
			const match = REFUSAL_BODY_PATTERN.exec(wire.body ?? "");
			return {
				headCommit: wire.commit_id ?? match?.[1] ?? "",
				reason: match?.[2] ?? "",
			};
		},
		encode: ({ headCommit, reason }) => ({
			[COMMIT_ID_KEY]: headCommit,
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

export { comment, GitHubReviewCommentCodec, GitHubReviewPayloadCodec, payload };
