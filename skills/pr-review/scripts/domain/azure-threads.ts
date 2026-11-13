import { z } from "zod";
import {
	CommentCommentType,
	CommentThreadStatus,
} from "../../clients/azure-git.g.ts";
import { PullRequestThreadsListResponse } from "../../clients/azure-git.zod.g.ts";
import {
	type HeadCommit,
	type Outcome,
	type Side,
	type Thread,
	type ThreadId,
	ThreadSchema,
	type ThreadState,
} from "./contracts.g.ts";
import { isNullOrEmpty } from "./nullish.ts";
import { ours as written } from "./rulebook.ts";

const LEADING_SLASH = /^\//u;
const PRIOR = / probes at ([0-9a-f]{40})\b/u;
const STATE_BY_STATUS: Readonly<Record<string, ThreadState>> = {
	active: "open",
	fixed: "resolved-by-author",
};
const STATUS_BY_STATE: Readonly<Record<ThreadState, CommentThreadStatus>> = {
	open: CommentThreadStatus.active,
	"resolved-by-author": CommentThreadStatus.fixed,
	resolved: CommentThreadStatus.closed,
};

const AzureThreadTransportSchema =
	PullRequestThreadsListResponse.shape.value.element;

export const AzureThreadsListCodec = z.codec(
	PullRequestThreadsListResponse,
	z.array(AzureThreadTransportSchema),
	{
		decode: (wire) => wire.value,
		encode: (value) => ({ count: value.length, value }),
	},
);

export type AzureThreadRecord = Pick<
	z.infer<typeof AzureThreadTransportSchema>,
	"id" | "status" | "threadContext" | "comments"
>;

export const onLines = (
	record: Pick<AzureThreadRecord, "threadContext">,
): boolean => Boolean(record.threadContext?.filePath);

const firstComment = (record: Pick<AzureThreadRecord, "comments">): string =>
	record.comments?.[0]?.content ?? "";

export const isOurThread = (
	record: Pick<AzureThreadRecord, "comments">,
): boolean => written(firstComment(record));

export const AzureThreadCodec = z.codec(
	AzureThreadTransportSchema,
	ThreadSchema,
	{
		decode: (record) => {
			const context = record.threadContext;
			const side: Side = isNullOrEmpty(context?.rightFileEnd) ? "base" : "head";
			const start =
				side === "head" ? context?.rightFileStart : context?.leftFileStart;
			const end =
				(side === "head"
					? context?.rightFileEnd?.line
					: context?.leftFileEnd?.line) ?? 1;
			return {
				id: String(record.id ?? ""),
				path: (context?.filePath ?? "").replace(LEADING_SLASH, ""),
				side,
				lines: { start: start?.line ?? end, end },
				state: STATE_BY_STATUS[record.status ?? ""] ?? "resolved",
				body: firstComment(record),
			};
		},
		encode: (domainThread) => {
			const startPosition = { line: domainThread.lines.start, offset: 1 };
			const endPosition = { line: domainThread.lines.end, offset: 1 };
			const threadContext =
				domainThread.side === "head"
					? {
							filePath: `/${domainThread.path}`,
							rightFileStart: startPosition,
							rightFileEnd: endPosition,
						}
					: {
							filePath: `/${domainThread.path}`,
							leftFileStart: startPosition,
							leftFileEnd: endPosition,
						};
			return {
				id: Number(domainThread.id),
				status: STATUS_BY_STATE[domainThread.state],
				threadContext,
				comments: [
					{
						parentCommentId: 0,
						commentType: CommentCommentType.text,
						content: domainThread.body,
					},
				],
			};
		},
	},
);

export function thread(record: AzureThreadRecord): Thread {
	return AzureThreadCodec.decode(record);
}

const pullRequestThreads = (rawThreads: readonly AzureThreadRecord[]) =>
	rawThreads.filter((record) => !onLines(record) && isOurThread(record));

export function refusedOf(
	rawThreads: readonly AzureThreadRecord[],
	headCommit: HeadCommit,
): ThreadId | null {
	const found = pullRequestThreads(rawThreads).find((record) =>
		firstComment(record).includes(`Not reviewed at ${headCommit} `),
	);
	return isNullOrEmpty(found) ? null : String(found.id);
}

export const staleRefusals = (
	rawThreads: readonly AzureThreadRecord[],
): ThreadId[] =>
	pullRequestThreads(rawThreads)
		.filter(
			(record) =>
				record.status === "active" &&
				firstComment(record).includes("Not reviewed at "),
		)
		.map((record) => String(record.id));

export const priorOf = (
	rawThreads: readonly AzureThreadRecord[],
): HeadCommit | null =>
	pullRequestThreads(rawThreads)
		.map((record) => PRIOR.exec(firstComment(record)))
		.filter((match) => !isNullOrEmpty(match))
		.at(-1)?.[1] ?? null;

export function unposted(
	outcome: Outcome,
	rawThreads: readonly AzureThreadRecord[],
) {
	const active = rawThreads.filter(
		(record) => record.status === "active" && isOurThread(record),
	);
	const carried = active.filter(onLines).map(thread);
	const inline = outcome.inline.filter(
		(finding) =>
			!carried.some(
				(existing) =>
					existing.path === finding.path &&
					existing.lines.end === finding.lines.end &&
					existing.body === finding.body,
			),
	);
	const summary = !active.some(
		(record) =>
			!onLines(record) &&
			firstComment(record).includes(`probes at ${outcome.headCommit} `),
	);
	const activeIds = new Set(active.map((record) => String(record.id)));
	return {
		inline,
		summary,
		settle: outcome.settle.filter((id) => activeIds.has(id)),
	};
}
