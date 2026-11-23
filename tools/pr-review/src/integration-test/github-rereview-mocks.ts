import { HttpResponse, http } from "msw";
import { nonnull } from "../domain/nullish.ts";
import { SITE } from "../domain/rulebook.ts";
import {
	getPullsCreateReviewResponseMock,
	getPullsGetMockHandler,
	getPullsGetResponseMock,
	getPullsListReviewsMockHandler,
	getPullsListReviewsResponseMock,
} from "../generated/github/github.g.ts";
import { PullsCreateReviewBody } from "../generated/github/github.zod.g.ts";
import type { ScenarioRepo } from "./scenario-repo.ts";

const MERGEABLE_STATE_KEY = "mergeable_state";
const CHANGED_FILES_KEY = "changed_files";
const COMMIT_ID_KEY = "commit_id";
const HTML_URL_KEY = "html_url";

interface ReReviewGraphQlVariables {
	readonly threadId?: string;
	readonly after?: string | null;
}

interface GitHubReReviewRecorder {
	readonly settledThreadIds: string[];
	readonly reopenedThreadIds: string[];
	readonly postedBodies: string[];
}

const buildReReviewPage1 = (citeYagni: string) => ({
	data: {
		repository: {
			pullRequest: {
				viewerCanUpdate: true,
				reviewThreads: {
					pageInfo: { hasNextPage: true, endCursor: "cursor-page-2" },
					nodes: [
						{
							id: "T_open_fixed",
							isResolved: false,
							resolvedBy: null,
							path: "service.ts",
							diffSide: "RIGHT",
							startLine: null,
							line: 2,
							comments: {
								nodes: [{ body: `Unused export y breaks ${citeYagni}` }],
							},
						},
						{
							id: "T_resolved_recurring",
							isResolved: true,
							resolvedBy: { login: "author@example.com" },
							path: "helper.ts",
							diffSide: "RIGHT",
							startLine: null,
							line: 1,
							comments: {
								nodes: [{ body: `Unused export z breaks ${citeYagni}` }],
							},
						},
					],
				},
			},
		},
	},
});

const buildReReviewPage2 = (citeYagni: string) => ({
	data: {
		repository: {
			pullRequest: {
				viewerCanUpdate: true,
				reviewThreads: {
					pageInfo: { hasNextPage: false, endCursor: null },
					nodes: [
						{
							id: "T_human",
							isResolved: false,
							resolvedBy: null,
							path: "helper.ts",
							diffSide: "RIGHT",
							startLine: null,
							line: 1,
							comments: { nodes: [{ body: "Human comment on line 1" }] },
						},
						{
							id: "T_outdated",
							isResolved: false,
							resolvedBy: null,
							path: "service.ts",
							diffSide: "RIGHT",
							startLine: null,
							line: null,
							comments: {
								nodes: [{ body: `Outdated breaks ${citeYagni}` }],
							},
						},
					],
				},
			},
		},
	},
});

const createReReviewGraphQlHandler = (
	recorder: GitHubReReviewRecorder,
	citeYagni: string,
) => {
	const page1Threads = buildReReviewPage1(citeYagni);
	const page2Threads = buildReReviewPage2(citeYagni);
	return http.post("https://api.github.com/graphql", async ({ request }) => {
		const payload = (await request.json()) as {
			readonly query: string;
			readonly variables: ReReviewGraphQlVariables;
		};
		const threadId = String(payload.variables.threadId);
		if (payload.query.includes("unresolveReviewThread")) {
			recorder.reopenedThreadIds.push(threadId);
			return HttpResponse.json({
				data: {
					unresolveReviewThread: {
						thread: { id: threadId, isResolved: false },
					},
				},
			});
		}
		if (payload.query.includes("resolveReviewThread")) {
			recorder.settledThreadIds.push(threadId);
			return HttpResponse.json({
				data: {
					resolveReviewThread: {
						thread: { id: threadId, isResolved: true },
					},
				},
			});
		}
		if (payload.variables.after === "cursor-page-2") {
			return HttpResponse.json(page2Threads);
		}
		return HttpResponse.json(page1Threads);
	});
};

function createGitHubReReviewHandlers(
	repo: ScenarioRepo,
	recorder: GitHubReReviewRecorder,
) {
	const basePull = getPullsGetResponseMock({
		number: 42,
		title: "Update helper",
		body: "Re-review body",
		[MERGEABLE_STATE_KEY]: "clean",
		additions: 10,
		deletions: 2,
		[CHANGED_FILES_KEY]: 2,
	});
	const baseReview = nonnull(getPullsListReviewsResponseMock()[0]);
	const citeYagni = `[You aren't gonna need it](${SITE}#you-arent-gonna-need-it)`;
	return [
		getPullsGetMockHandler({
			...basePull,
			user: { ...basePull.user, login: "author@example.com" },
			base: { ...basePull.base, ref: "main", sha: repo.baseCommit },
			head: {
				...basePull.head,
				ref: "feature-v2",
				sha: repo.headCommitV2,
			},
		}),
		getPullsListReviewsMockHandler([
			{
				...baseReview,
				[COMMIT_ID_KEY]: repo.headCommit,
				body: `**Verdict: request-changes**\n\n1 rules probed by 1 probes at ${repo.headCommit} against [the rules](${SITE}): 1 violations`,
			},
		]),
		http.post(
			"https://api.github.com/repos/:owner/:repo/pulls/:pull_number/reviews",
			async ({ request }) => {
				const raw = (await request.json()) as Parameters<
					typeof PullsCreateReviewBody.decode
				>[0];
				const body = PullsCreateReviewBody.decode(raw);
				recorder.postedBodies.push(nonnull(body.body));
				return HttpResponse.json(
					getPullsCreateReviewResponseMock({
						[HTML_URL_KEY]:
							"https://github.com/octocat/hello-world/pull/42#pullrequestreview-2",
					}),
				);
			},
		),
		createReReviewGraphQlHandler(recorder, citeYagni),
	];
}

export { createGitHubReReviewHandlers, type GitHubReReviewRecorder };
