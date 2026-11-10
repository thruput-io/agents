import type { GraphQLClient } from "graphql-request";
import { z } from "zod";
import {
	type Developer,
	DeveloperSchema,
	type GitHub,
	LineNumberSchema,
	LineRangeSchema,
	PathSchema,
	SideSchema,
	SummarySchema,
	type Thread,
	type ThreadId,
	ThreadIdSchema,
	ThreadSchema,
	type ThreadState,
	ThreadStateSchema,
} from "./contracts.g.ts";
import { isNullOrEmpty } from "./nullish.ts";
import { ours } from "./rulebook.ts";

const SIDE_OF = { RIGHT: "head", LEFT: "base" } as const;

export const REVIEW_THREADS_QUERY = `
query ReviewThreads($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
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

export const ThreadsPage = z
	.object({
		data: z.object({
			repository: z.object({
				pullRequest: z.object({
					reviewThreads: z.object({
						pageInfo: z.object({
							hasNextPage: z.boolean(),
							endCursor: SummarySchema.nullable(),
						}),
						nodes: z.array(ThreadNode),
					}),
				}),
			}),
		}),
	})
	.transform((page) => page.data.repository.pullRequest.reviewThreads);

export type GitHubThreadNode = z.infer<typeof ThreadNode>;

export const isReviewableThreadNode = (node: GitHubThreadNode): boolean =>
	!isNullOrEmpty(node.line) && ours(node.comments.nodes[0]?.body ?? "");

export function thread(node: GitHubThreadNode, author: Developer): Thread {
	const end = node.line ?? 1;
	const state: ThreadState = ThreadStateSchema.parse(
		node.isResolved
			? node.resolvedBy?.login === author
				? "resolved-by-author"
				: "resolved"
			: "open",
	);
	return ThreadSchema.parse({
		id: node.id,
		path: node.path,
		side: SideSchema.parse(SIDE_OF[node.diffSide]),
		lines: LineRangeSchema.parse({ start: node.startLine ?? end, end }),
		state,
		body: node.comments.nodes[0]?.body ?? "",
	});
}

export async function fetchGitHubThreads(
	client: GraphQLClient,
	host: GitHub,
	author: Developer,
): Promise<readonly Thread[]> {
	const collected: Thread[] = [];
	let after: string | null = null;
	let hasNextPage = true;
	while (hasNextPage) {
		const response = await client.rawRequest(REVIEW_THREADS_QUERY, {
			owner: host.owner,
			name: host.repository,
			number: host.number,
			after,
		});
		const page = ThreadsPage.parse({ data: response.data });
		for (const node of page.nodes.filter(isReviewableThreadNode)) {
			collected.push(thread(node, author));
		}
		hasNextPage = page.pageInfo.hasNextPage;
		after = page.pageInfo.endCursor;
	}
	return collected;
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
