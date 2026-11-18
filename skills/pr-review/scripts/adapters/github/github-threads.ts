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
} from "../../domain/contracts.g.ts";
import { isNullOrEmpty } from "../../domain/nullish.ts";
import { ours } from "../../domain/rulebook.ts";

const SIDE_OF = new Map<string, "head" | "base">([
	["RIGHT", "head"],
	["LEFT", "base"],
]);

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

const isReviewableThreadNode = (node: GitHubThreadNode): boolean =>
	!isNullOrEmpty(node.line) && ours(node.comments.nodes[0]?.body ?? "");

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

function thread(node: GitHubThreadNode, author: Developer): Thread {
	const end = node.line ?? 1;
	const state = threadState(node, author);
	return {
		id: node.id,
		path: node.path,
		side: SIDE_OF.get(node.diffSide) ?? "head",
		lines: { start: node.startLine ?? end, end },
		state,
		body: node.comments.nodes[0]?.body ?? "",
	};
}

type FetchGitHubThreadsResult =
	| {
			readonly ok: true;
			readonly viewerCanUpdate: boolean;
			readonly threads: readonly Thread[];
	  }
	| {
			readonly ok: false;
			readonly status: number;
			readonly headers: Headers;
			readonly data?: unknown;
	  };

const GraphQlErrorResponseSchema = z.object({
	body: z.string().optional(),
	message: SummarySchema.optional(),
	errors: z.array(z.object({ message: SummarySchema })).optional(),
});

const extractClientErrorData = (response: unknown): unknown => {
	const parsed = GraphQlErrorResponseSchema.safeDecode(
		response as z.input<typeof GraphQlErrorResponseSchema>,
	);
	if (!parsed.success) {
		return undefined;
	}
	const directMessage =
		parsed.data.message ?? parsed.data.errors?.[0]?.message ?? undefined;
	if (!isNullOrEmpty(directMessage)) {
		return { message: directMessage };
	}
	if (!isNullOrEmpty(parsed.data.body)) {
		try {
			return JSON.parse(parsed.data.body);
		} catch {
			return undefined;
		}
	}
	return undefined;
};

const fetchThreadsPage = async (
	client: GraphQLClient,
	host: GitHub,
	author: Developer,
	state: {
		readonly after: string | null;
		readonly viewerCanUpdate: boolean;
		readonly collected: Thread[];
	},
): Promise<FetchGitHubThreadsResult> => {
	try {
		const response = await client.rawRequest(REVIEW_THREADS_QUERY, {
			owner: host.owner,
			name: host.repository,
			number: host.number,
			after: state.after,
		});
		const rawData = response.data as z.input<
			typeof RawThreadsPageSchema
		>["data"];
		const viewerCanUpdate =
			state.viewerCanUpdate &&
			rawData.repository.pullRequest.viewerCanUpdate !== false;
		const page = ThreadsPage.decode({ data: rawData });
		for (const node of page.nodes.filter(isReviewableThreadNode)) {
			state.collected.push(thread(node, author));
		}
		const { hasNextPage, endCursor } = page.pageInfo;
		if (!hasNextPage) {
			return { ok: true, viewerCanUpdate, threads: state.collected };
		}
		return fetchThreadsPage(client, host, author, {
			after: endCursor,
			viewerCanUpdate,
			collected: state.collected,
		});
	} catch (error) {
		if (error instanceof ClientError) {
			return {
				ok: false,
				status: error.response.status,
				headers: error.response.headers ?? new Headers(),
				data: extractClientErrorData(error.response),
			};
		}
		throw error;
	}
};

export function fetchGitHubThreads(
	client: GraphQLClient,
	host: GitHub,
	author: Developer,
): Promise<FetchGitHubThreadsResult> {
	return fetchThreadsPage(client, host, author, {
		after: null,
		viewerCanUpdate: true,
		collected: [],
	});
}

export type { FetchGitHubThreadsResult, GitHubThreadNode };
export {
	isReviewableThreadNode,
	RESOLVE_REVIEW_THREAD_MUTATION,
	REVIEW_THREADS_QUERY,
	ThreadsPage,
	thread,
	UNRESOLVE_REVIEW_THREAD_MUTATION,
};

export type MutateGitHubThreadsResult =
	| { readonly ok: true }
	| {
			readonly ok: false;
			readonly status: number;
			readonly headers: Headers;
			readonly data?: unknown;
	  };

export async function settleAndReopenGitHubThreads(
	client: GraphQLClient,
	settle: readonly ThreadId[],
	reopen: readonly ThreadId[],
): Promise<MutateGitHubThreadsResult> {
	try {
		await Promise.all([
			...settle.map((threadId) =>
				client.rawRequest(RESOLVE_REVIEW_THREAD_MUTATION, { threadId }),
			),
			...reopen.map((threadId) =>
				client.rawRequest(UNRESOLVE_REVIEW_THREAD_MUTATION, { threadId }),
			),
		]);
		return { ok: true };
	} catch (error) {
		if (error instanceof ClientError) {
			return {
				ok: false,
				status: error.response.status,
				headers: error.response.headers ?? new Headers(),
				data: extractClientErrorData(error.response),
			};
		}
		throw error;
	}
}
