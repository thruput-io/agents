import { z } from "zod";
import {
	type Developer,
	DeveloperSchema,
	LineNumberSchema,
	PathSchema,
	SummarySchema,
	type Thread,
	ThreadIdSchema,
	ThreadSchema,
	type ThreadState,
} from "../../domain/contracts.g.ts";
import { isNullOrEmpty, nonnull } from "../../domain/nullish.ts";
import { ours } from "../../domain/rulebook.ts";

const SIDE_OF = new Map<string, "head" | "base">([
	["RIGHT", "head"],
	["LEFT", "base"],
]);
const DIFF_SIDE_OF = {
	head: "RIGHT",
	base: "LEFT",
} as const;

const REVIEW_THREADS_QUERY = `
query ReviewThreads($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      viewerCanUpdate
      reviewThreads(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id path line startLine diffSide isResolved
          resolvedBy { login }
          comments(first: 1) { nodes { body } }
        }
      }
    }
  }
}
`;

const RESOLVE_REVIEW_THREAD_MUTATION = `
mutation ResolveReviewThread($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { id isResolved }
  }
}
`;

const UNRESOLVE_REVIEW_THREAD_MUTATION = `
mutation UnresolveReviewThread($threadId: ID!) {
  unresolveReviewThread(input: { threadId: $threadId }) {
    thread { id isResolved }
  }
}
`;

const ThreadNode = z.object({
	id: ThreadIdSchema,
	path: PathSchema,
	line: LineNumberSchema.nullable(),
	startLine: LineNumberSchema.nullable(),
	diffSide: z.enum(["RIGHT", "LEFT"]),
	isResolved: z.boolean(),
	resolvedBy: z.object({ login: DeveloperSchema }).nullable(),
	comments: z.object({
		nodes: z.array(z.object({ body: SummarySchema.or(z.literal("")) })),
	}),
});

const ReviewThreadsConnectionSchema = z.object({
	pageInfo: z.object({
		hasNextPage: z.boolean(),
		endCursor: SummarySchema.nullable(),
	}),
	nodes: z.array(ThreadNode),
});

const RawThreadsPageSchema = z.object({
	data: z.object({
		repository: z.object({
			pullRequest: z.object({
				viewerCanUpdate: z.boolean().optional(),
				reviewThreads: ReviewThreadsConnectionSchema,
			}),
		}),
	}),
});

const ThreadsPage = z.codec(
	RawThreadsPageSchema,
	ReviewThreadsConnectionSchema,
	{
		decode: (page) => page.data.repository.pullRequest.reviewThreads,
		encode: (reviewThreads) => ({
			data: {
				repository: {
					pullRequest: {
						reviewThreads,
					},
				},
			},
		}),
	},
);

type GitHubThreadNode = z.infer<typeof ThreadNode>;

const firstCommentBodyOf = (node: GitHubThreadNode): string => {
	const [first] = node.comments.nodes;
	if (first === undefined) {
		return "";
	}
	return first.body;
};

const numberOr = (value: number | null, fallback: number): number => {
	if (value === null) {
		return fallback;
	}
	return value;
};

const sideOf = (diffSide: GitHubThreadNode["diffSide"]): "head" | "base" =>
	nonnull(SIDE_OF.get(diffSide));

const isReviewableThreadNode = (node: GitHubThreadNode): boolean =>
	!isNullOrEmpty(node.line) && ours(firstCommentBodyOf(node));

const threadState = (
	node: GitHubThreadNode,
	author: Developer,
): ThreadState => {
	if (!node.isResolved) {
		return "open";
	}
	if (node.resolvedBy?.login === author) {
		return "resolved-by-author";
	}
	return "resolved";
};

const resolvedByOf = (
	state: ThreadState,
	author: Developer,
): { readonly login: Developer } | null => {
	if (state === "resolved-by-author") {
		return { login: author };
	}
	return null;
};

const gitHubThreadCodec = (author: Developer) =>
	z.codec(ThreadNode, ThreadSchema, {
		decode: (node) => {
			const end = numberOr(node.line, 1);
			return {
				id: node.id,
				path: node.path,
				side: sideOf(node.diffSide),
				lines: { start: numberOr(node.startLine, end), end },
				state: threadState(node, author),
				body: firstCommentBodyOf(node),
			};
		},
		encode: (domainThread) => ({
			id: domainThread.id,
			path: domainThread.path,
			line: domainThread.lines.end,
			startLine: domainThread.lines.start,
			diffSide: DIFF_SIDE_OF[domainThread.side],
			isResolved: domainThread.state !== "open",
			resolvedBy: resolvedByOf(domainThread.state, author),
			comments: { nodes: [{ body: domainThread.body }] },
		}),
	});

function thread(node: GitHubThreadNode, author: Developer): Thread {
	return gitHubThreadCodec(author).decode(node);
}

export type { GitHubThreadNode };
export {
	isReviewableThreadNode,
	RawThreadsPageSchema,
	RESOLVE_REVIEW_THREAD_MUTATION,
	REVIEW_THREADS_QUERY,
	ThreadsPage,
	thread,
	UNRESOLVE_REVIEW_THREAD_MUTATION,
};
