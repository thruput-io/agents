import { z } from "zod";
import {
	type InlineFinding,
	InlineFindingSchema,
	type Side,
} from "../../domain/contracts.g.ts";
import type { PullsCreateReviewBodyCommentsItem } from "../../generated/github/github.g.ts";
import { PullsCreateReviewBody } from "../../generated/github/github.zod.g.ts";

const HOST_SIDE_OF = { head: "RIGHT", base: "LEFT" } as const;
const DOMAIN_SIDE_OF = new Map<string, Side>([
	["RIGHT", "head"],
	["LEFT", "base"],
]);
const START_LINE_KEY = "start_line";
const START_SIDE_KEY = "start_side";

const GitHubReviewCommentTransportSchema =
	PullsCreateReviewBody.shape.comments.unwrap().element;

const endLineOf = (line: number | undefined): number => {
	if (line === undefined) {
		return 1;
	}
	return line;
};

const startLineOf = (
	startLine: number | undefined,
	endLine: number,
): number => {
	if (startLine === undefined) {
		return endLine;
	}
	return startLine;
};

const domainSideOf = (side: string | undefined): Side => {
	if (side === undefined) {
		return "head";
	}
	const mapped = DOMAIN_SIDE_OF.get(side);
	if (mapped === undefined) {
		return "head";
	}
	return mapped;
};

const GitHubReviewCommentCodec = z.codec(
	GitHubReviewCommentTransportSchema,
	InlineFindingSchema,
	{
		decode: (wire) => {
			const end = endLineOf(wire.line);
			return {
				path: wire.path,
				side: domainSideOf(wire.side),
				lines: {
					start: startLineOf(wire.start_line, end),
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

export { comment, DOMAIN_SIDE_OF, GitHubReviewCommentCodec, HOST_SIDE_OF };
