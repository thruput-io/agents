import { ClientError, type GraphQLClient } from "graphql-request";
import { z } from "zod";
import {
	type Developer,
	DeveloperSchema,
	type GitHub,
	LineNumberSchema,
	PathSchema,
	SummarySchema,
	type Thread,
	type ThreadId,
	ThreadIdSchema,
	type ThreadState,
} from "./contracts.g.ts";
import { isNullOrEmpty } from "./nullish.ts";
import { ours } from "./rulebook.ts";

const SIDE_OF = { RIGHT: "head", LEFT: "base" } as const;

export const REVIEW_THREADS_QUERY = `
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

export const RESOLVE_REVIEW_THREAD_MUTATION = `
mutation ResolveReviewThread($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { id isResolved }
  }
}
`;

export const UNRESOLVE_REVIEW_THREAD_MUTATION = `
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

export const ThreadsPage = z.codec(
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

export type GitHubThreadNode = z.infer<typeof ThreadNode>;

export const isReviewableThreadNode = (node: GitHubThreadNode): boolean =>
	!isNullOrEmpty(node.line) && ours(node.comments.nodes[0]?.body ?? "");

export function thread(node: GitHubThreadNode, author: Developer): Thread {
	const end = node.line ?? 1;
	const state: ThreadState = node.isResolved
		? node.resolvedBy?.login === author
			? "resolved-by-author"
			: "resolved"
		: "open";
	return {
		id: node.id,
		path: node.path,
		side: SIDE_OF[node.diffSide],
		lines: { start: node.startLine ?? end, end },
		state,
		body: node.comments.nodes[0]?.body ?? "",
	};
}

export type FetchGitHubThreadsResult =
	| {
			readonly ok: true;
			readonly viewerCanUpdate: boolean;
			readonly threads: readonly Thread[];
	  }
	| {
			readonly ok: false;
			readonly status: number;
			readonly headers: Headers;
	  };

export async function fetchGitHubThreads(
	client: GraphQLClient,
	host: GitHub,
	author: Developer,
): Promise<FetchGitHubThreadsResult> {
	const collected: Thread[] = [];
	let after: string | null = null;
	let hasNextPage = true;
	let viewerCanUpdate = true;
	while (hasNextPage) {
		try {
			const response = await client.rawRequest(REVIEW_THREADS_QUERY, {
				owner: host.owner,
				name: host.repository,
				number: host.number,
				after,
			});
			const rawData = response.data as z.input<
				typeof RawThreadsPageSchema
			>["data"];
			if (rawData.repository.pullRequest.viewerCanUpdate === false) {
				viewerCanUpdate = false;
			}
			const page = ThreadsPage.decode({ data: rawData });
			for (const node of page.nodes.filter(isReviewableThreadNode)) {
				collected.push(thread(node, author));
			}
			hasNextPage = page.pageInfo.hasNextPage;
			after = page.pageInfo.endCursor;
		} catch (error) {
			if (error instanceof ClientError) {
				return {
					ok: false,
					status: error.response.status,
					headers: error.response.headers ?? new Headers(),
				};
			}
			throw error;
		}
	}
	return { ok: true, viewerCanUpdate, threads: collected };
}

export async function settleAndReopenGitHubThreads(
	client: GraphQLClient,
	settle: readonly ThreadId[],
	reopen: readonly ThreadId[],
): Promise<void> {
	await Promise.all([
		...settle.map((threadId) =>
			client.rawRequest(RESOLVE_REVIEW_THREAD_MUTATION, { threadId }),
		),
		...reopen.map((threadId) =>
			client.rawRequest(UNRESOLVE_REVIEW_THREAD_MUTATION, { threadId }),
		),
	]);
}
