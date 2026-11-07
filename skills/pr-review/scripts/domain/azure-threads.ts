import type { GitPullRequestCommentThread } from "../../clients/azure-git.g.ts";
import {
	type HeadCommit,
	HeadCommitSchema,
	LineRangeSchema,
	type Outcome,
	type Side,
	SideSchema,
	type Thread,
	type ThreadId,
	ThreadIdSchema,
	ThreadSchema,
	type ThreadState,
	ThreadStateSchema,
} from "./contracts.g.ts";
import { isNullOrEmpty } from "./nullish.ts";
import { ours as written } from "./rulebook.ts";

const LEADING_SLASH = /^\//u;
const PRIOR = / probes at ([0-9a-f]{40})\b/u;
const STATE_BY_STATUS: Readonly<Record<string, ThreadState>> = {
	active: "open",
	fixed: "resolved-by-author",
};

export type AzureThreadRecord = Pick<
	GitPullRequestCommentThread,
	"id" | "status" | "threadContext" | "comments"
>;

export const onLines = (
	record: Pick<GitPullRequestCommentThread, "threadContext">,
): boolean => Boolean(record.threadContext?.filePath);

const firstComment = (
	record: Pick<GitPullRequestCommentThread, "comments">,
): string => record.comments?.[0]?.content ?? "";

export const isOurThread = (
	record: Pick<GitPullRequestCommentThread, "comments">,
): boolean => written(firstComment(record));

export function thread(record: AzureThreadRecord): Thread {
	const context = record.threadContext;
	const side: Side = SideSchema.parse(
		isNullOrEmpty(context?.rightFileEnd) ? "base" : "head",
	);
	const start =
		side === "head" ? context?.rightFileStart : context?.leftFileStart;
	const end =
		(side === "head"
			? context?.rightFileEnd?.line
			: context?.leftFileEnd?.line) ?? 1;
	return ThreadSchema.parse({
		id: String(record.id ?? ""),
		path: (context?.filePath ?? "").replace(LEADING_SLASH, ""),
		side,
		lines: LineRangeSchema.parse({ start: start?.line ?? end, end }),
		state: ThreadStateSchema.parse(
			STATE_BY_STATUS[record.status ?? ""] ?? "resolved",
		),
		body: firstComment(record),
	});
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
	return isNullOrEmpty(found) ? null : ThreadIdSchema.parse(String(found.id));
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
		.map((record) => ThreadIdSchema.parse(String(record.id)));

export const priorOf = (
	rawThreads: readonly AzureThreadRecord[],
): HeadCommit | null => {
	const raw =
		pullRequestThreads(rawThreads)
			.map((record) => PRIOR.exec(firstComment(record)))
			.filter((match) => !isNullOrEmpty(match))
			.at(-1)?.[1] ?? null;
	return isNullOrEmpty(raw) ? null : HeadCommitSchema.parse(raw);
};

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
