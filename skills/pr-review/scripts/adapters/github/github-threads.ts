import { ClientError, type GraphQLClient } from "graphql-request";
import { z } from "zod";
import {
	type Developer,
	type GitHub,
	SummarySchema,
	type Thread,
	type ThreadId,
} from "../../domain/contracts.g.ts";
import { isNullOrEmpty } from "../../domain/nullish.ts";
import {
	isReviewableThreadNode,
	type RawThreadsPageSchema,
	RESOLVE_REVIEW_THREAD_MUTATION,
	REVIEW_THREADS_QUERY,
	ThreadsPage,
	thread,
	UNRESOLVE_REVIEW_THREAD_MUTATION,
} from "./github-thread-codecs.ts";

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
			readonly data: unknown;
	  };

const GraphQlErrorResponseSchema = z.object({
	body: z.string().optional(),
	message: SummarySchema.optional(),
	errors: z.array(z.object({ message: SummarySchema })).optional(),
});

const directErrorMessageOf = (
	data: z.infer<typeof GraphQlErrorResponseSchema>,
): string | null => {
	if (data.message !== undefined) {
		return data.message;
	}
	if (data.errors !== undefined && data.errors[0] !== undefined) {
		return data.errors[0].message;
	}
	return null;
};

const responseHeadersOf = (headers: Headers | undefined): Headers => {
	if (headers === undefined) {
		return new Headers();
	}
	return headers;
};

const extractClientErrorData = (response: unknown): unknown => {
	const parsed = GraphQlErrorResponseSchema.safeDecode(
		response as z.input<typeof GraphQlErrorResponseSchema>,
	);
	if (!parsed.success) {
		return null;
	}
	const directMessage = directErrorMessageOf(parsed.data);
	if (!isNullOrEmpty(directMessage)) {
		return { message: directMessage };
	}
	if (!isNullOrEmpty(parsed.data.body)) {
		const trimmed = parsed.data.body.trimStart();
		if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
			return JSON.parse(parsed.data.body);
		}
	}
	return null;
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
				headers: responseHeadersOf(error.response.headers),
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

export type { FetchGitHubThreadsResult };

export type MutateGitHubThreadsResult =
	| { readonly ok: true }
	| {
			readonly ok: false;
			readonly status: number;
			readonly headers: Headers;
			readonly data: unknown;
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
				headers: responseHeadersOf(error.response.headers),
				data: extractClientErrorData(error.response),
			};
		}
		throw error;
	}
}
