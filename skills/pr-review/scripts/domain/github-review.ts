import { z } from "zod";
import {
	type PullsCreateReviewBody,
	type PullsCreateReviewBodyCommentsItem,
	PullsCreateReviewBodyEvent,
} from "../../clients/github.g.ts";
import {
	type HeadCommit,
	HeadCommitSchema,
	type InlineFinding,
	InlineFindingSchema,
	type Outcome,
	OutcomeSchema,
	type Summary,
	SummarySchema,
} from "./contracts.g.ts";
import { SITE } from "./rulebook.ts";

const HOST_SIDE_OF = { head: "RIGHT", base: "LEFT" } as const;
const EVENT_OF = {
	approve: PullsCreateReviewBodyEvent.APPROVE,
	"request-changes": PullsCreateReviewBodyEvent.REQUEST_CHANGES,
} as const;

const GitHubReviewCommentSchema = InlineFindingSchema.transform(
	(finding): PullsCreateReviewBodyCommentsItem => {
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
);

export const comment = (
	finding: InlineFinding,
): PullsCreateReviewBodyCommentsItem =>
	GitHubReviewCommentSchema.parse(finding);

const GitHubReviewPayloadSchema = z
	.object({
		outcome: OutcomeSchema,
		ledgerTable: SummarySchema.or(z.literal("")),
	})
	.transform(({ outcome, ledgerTable }): PullsCreateReviewBody => {
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
	});

export const payload = (
	outcome: Outcome,
	ledgerTable: string,
): PullsCreateReviewBody =>
	GitHubReviewPayloadSchema.parse({ outcome, ledgerTable });

const GitHubRefusalPayloadSchema = z
	.object({
		headCommit: HeadCommitSchema,
		reason: SummarySchema,
	})
	.transform(
		({ headCommit, reason }): PullsCreateReviewBody => ({
			commit_id: headCommit,
			event: PullsCreateReviewBodyEvent.REQUEST_CHANGES,
			body: `**Verdict: request-changes**\n\nNot reviewed at ${headCommit} against [the rules](${SITE}): ${reason}.`,
		}),
	);

export const refusalPayload = (
	headCommit: HeadCommit,
	reason: Summary,
): PullsCreateReviewBody =>
	GitHubRefusalPayloadSchema.parse({ headCommit, reason });
