import { z } from "zod";
import {
	type HeadCommit,
	type Outcome,
	type Thread,
	type ThreadId,
	ThreadSchema,
	type ThreadState,
} from "../../domain/contracts.g.ts";
import { isNullOrEmpty } from "../../domain/nullish.ts";
import { ours as written } from "../../domain/rulebook.ts";
import {
	CommentCommentType,
	CommentThreadStatus,
} from "../../generated/azure/azure-git.g.ts";
import { PullRequestThreadsListResponse } from "../../generated/azure/azure-git.zod.g.ts";
import {
	decodeAzureThreadContext,
	encodeAzureThreadContext,
} from "./azure-thread-context.ts";

const PRIOR = / probes at (?<commit>[0-9a-f]{40})\b/u;
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

const AzureThreadsListCodec = z.codec(
	PullRequestThreadsListResponse,
	z.array(AzureThreadTransportSchema),
	{
		decode: (wire) => wire.value,
		encode: (value) => ({ count: value.length, value }),
	},
);

type AzureThreadRecord = Pick<
	z.infer<typeof AzureThreadTransportSchema>,
	"id" | "status" | "threadContext" | "comments"
>;

const onLines = (record: Pick<AzureThreadRecord, "threadContext">): boolean =>
	Boolean(record.threadContext?.filePath);

const firstComment = (record: Pick<AzureThreadRecord, "comments">): string => {
	const content = record.comments?.[0]?.content;
	if (content === undefined || content === null) {
		return "";
	}
	return content;
};

const threadIdText = (id: number | null | undefined): string => {
	if (id === undefined || id === null) {
		return "";
	}
	return String(id);
};

const threadStateOf = (status: string | null | undefined): ThreadState => {
	if (status === undefined || status === null) {
		return "resolved";
	}
	const mapped = STATE_BY_STATUS[status];
	if (mapped === undefined) {
		return "resolved";
	}
	return mapped;
};

const pullRequestThreads = (rawThreads: readonly AzureThreadRecord[]) =>
	rawThreads.filter((record) => !onLines(record) && isOurThread(record));

export const isOurThread = (
	record: Pick<AzureThreadRecord, "comments">,
): boolean => written(firstComment(record));

export type { AzureThreadRecord };
export { AzureThreadsListCodec, onLines };

export const AzureThreadCodec = z.codec(
	AzureThreadTransportSchema,
	ThreadSchema,
	{
		decode: (record) => {
			const decoded = decodeAzureThreadContext(record.threadContext);
			return {
				id: threadIdText(record.id),
				...decoded,
				state: threadStateOf(record.status),
				body: firstComment(record),
			};
		},
		encode: (domainThread) => ({
			id: Number(domainThread.id),
			status: STATUS_BY_STATE[domainThread.state],
			threadContext: encodeAzureThreadContext(
				domainThread.path,
				domainThread.side,
				domainThread.lines,
			),
			comments: [
				{
					parentCommentId: 0,
					commentType: CommentCommentType.text,
					content: domainThread.body,
				},
			],
		}),
	},
);

export function thread(record: AzureThreadRecord): Thread {
	return AzureThreadCodec.decode(record);
}

export function refusedOf(
	rawThreads: readonly AzureThreadRecord[],
	headCommit: HeadCommit,
): ThreadId | null {
	const found = pullRequestThreads(rawThreads).find((record) =>
		firstComment(record).includes(`Not reviewed at ${headCommit} `),
	);
	if (isNullOrEmpty(found)) {
		return null;
	}
	return String(found.id);
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
): HeadCommit | null => {
	const lastMatch = pullRequestThreads(rawThreads)
		.map((record) => PRIOR.exec(firstComment(record)))
		.filter((match) => !isNullOrEmpty(match))
		.at(-1);
	if (lastMatch === undefined || lastMatch === null) {
		return null;
	}
	const [, commit] = lastMatch;
	if (commit === undefined) {
		return null;
	}
	return commit;
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
