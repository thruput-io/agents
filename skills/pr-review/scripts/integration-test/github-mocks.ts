import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addMocksToSchema } from "@graphql-tools/mock";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { graphql as executeGraphQl } from "graphql";
import { HttpResponse, http } from "msw";
import {
	getChecksListForRefMockHandler,
	getChecksListForRefResponseMock,
	getPullsCreateReviewMockHandler,
	getPullsCreateReviewResponseMock,
	getPullsGetMockHandler,
	getPullsGetResponseMock,
	getPullsListReviewsMockHandler,
	getPullsListReviewsResponseMock,
	getReposDownloadZipballArchiveMockHandler,
} from "../../clients/github.g.ts";
import { PullsCreateReviewBody } from "../../clients/github.zod.g.ts";
import { nonnull } from "../domain/nullish.ts";
import { SITE } from "../domain/rulebook.ts";
import type { ScenarioRepo } from "./scenario-repo.ts";

const GRAPHQL_SDL_PATH = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../references/hosts/github.graphql",
);
const executableGraphQlSchema = makeExecutableSchema({
	typeDefs: readFileSync(GRAPHQL_SDL_PATH, "utf8"),
});
const emptyThreadConnection = () => ({
	pageInfo: { hasNextPage: false, endCursor: null },
	nodes: [],
});
const mockedGraphQlSchema = addMocksToSchema({
	schema: executableGraphQlSchema,
	mocks: {
		PullRequest: () => ({ viewerCanUpdate: true }),
		PullRequestReviewThreadConnection: emptyThreadConnection,
	},
});

type GraphQlVariables = Readonly<
	Record<string, string | number | boolean | null | undefined>
>;

const createGraphQlHandler = () =>
	http.post("https://api.github.com/graphql", async ({ request }) => {
		const payload = (await request.json()) as {
			readonly query: string;
			readonly variables: GraphQlVariables;
		};
		const result = await executeGraphQl({
			schema: mockedGraphQlSchema,
			source: payload.query,
			variableValues: payload.variables,
		});
		return HttpResponse.json(result);
	});

export function createFailedGitHubChecksHandler(name: string) {
	const baseRun = nonnull(getChecksListForRefResponseMock().check_runs[0]);
	return getChecksListForRefMockHandler({
		total_count: 1,
		check_runs: [{ ...baseRun, name, conclusion: "failure" }],
	});
}

export function createForbiddenHtmlGitHubHandler() {
	return http.get(
		"https://api.github.com/repos/:owner/:repo/pulls/:pull_number",
		() =>
			new HttpResponse("<!DOCTYPE html><html>Forbidden</html>", {
				status: 403,
				headers: { "content-type": "text/html; charset=utf-8" },
			}),
	);
}

export function createReadOnlyOAuthScopesGitHubHandler(repo: ScenarioRepo) {
	const basePull = getPullsGetResponseMock({
		number: 42,
		mergeable_state: "clean",
	});
	return http.get(
		"https://api.github.com/repos/:owner/:repo/pulls/:pull_number",
		() =>
			HttpResponse.json(
				{
					...basePull,
					user: { ...basePull.user, login: "author@example.com" },
					base: { ...basePull.base, ref: "main", sha: repo.baseCommit },
					head: {
						...basePull.head,
						ref: "feature",
						sha: repo.headCommit,
					},
				},
				{
					status: 200,
					headers: { "x-oauth-scopes": "read:org, gist" },
				},
			),
	);
}

export function createReadOnlyViewerGitHubGraphQlHandler() {
	return http.post("https://api.github.com/graphql", () =>
		HttpResponse.json({
			data: {
				repository: {
					pullRequest: {
						viewerCanUpdate: false,
						reviewThreads: {
							pageInfo: { hasNextPage: false, endCursor: null },
							nodes: [],
						},
					},
				},
			},
		}),
	);
}

export function createForbiddenGitHubGraphQlHandler() {
	return http.post("https://api.github.com/graphql", () =>
		HttpResponse.json(
			{ message: "Resource not accessible by integration" },
			{ status: 403 },
		),
	);
}

export function createForbiddenGitHubZipballHandler() {
	return http.get(
		"https://api.github.com/repos/:owner/:repo/zipball/:ref",
		() =>
			HttpResponse.json(
				{ message: "Repository archive access denied" },
				{ status: 403 },
			),
	);
}

export function createFailedGitHubCreateReviewHandler() {
	return http.post(
		"https://api.github.com/repos/:owner/:repo/pulls/:pull_number/reviews",
		() =>
			HttpResponse.json(
				{
					message:
						"Validation Failed: PullRequestReview can only have one pending review per pull request",
				},
				{ status: 422 },
			),
	);
}

export function createInProgressGitHubChecksHandlers(
	name: string,
	postedReviews: string[],
) {
	const baseRun = nonnull(getChecksListForRefResponseMock().check_runs[0]);
	return [
		getChecksListForRefMockHandler({
			total_count: 1,
			check_runs: [
				{ ...baseRun, name, status: "in_progress", conclusion: null },
			],
		}),
		http.post(
			"https://api.github.com/repos/:owner/:repo/pulls/:pull_number/reviews",
			async ({ request }) => {
				const raw = (await request.json()) as Parameters<
					typeof PullsCreateReviewBody.decode
				>[0];
				const body = PullsCreateReviewBody.decode(raw);
				postedReviews.push(`${nonnull(body.event)}:${nonnull(body.body)}`);
				return HttpResponse.json(
					getPullsCreateReviewResponseMock({
						html_url:
							"https://github.com/octocat/hello-world/pull/42#pullrequestreview-99",
					}),
				);
			},
		),
	];
}

export function createGitHubAlreadyReviewedHandler(headCommit: string) {
	const baseReview = nonnull(getPullsListReviewsResponseMock()[0]);
	return getPullsListReviewsMockHandler([
		{
			...baseReview,
			commit_id: headCommit,
			body: `**Verdict: approve**\n\n1 rules probed by 1 probes at ${headCommit} against [the rules](${SITE}): 0 violations`,
		},
	]);
}

export function createGitHubExistingRefusalHandler(headCommit: string) {
	const baseReview = nonnull(getPullsListReviewsResponseMock()[0]);
	return getPullsListReviewsMockHandler([
		{
			...baseReview,
			body: `**Verdict: request-changes**\n\nNot reviewed at ${headCommit} against [the rules](${SITE}): check 'ci' is failure.`,
		},
	]);
}

export function createGitHubHandlers(repo: ScenarioRepo) {
	const basePull = getPullsGetResponseMock({
		number: 42,
		body: "Refine helper\n\nSecond body.\n\nAdd y export\n\nFirst body.",
		mergeable_state: "clean",
	});
	const baseRun = nonnull(getChecksListForRefResponseMock().check_runs[0]);
	return [
		getPullsGetMockHandler({
			...basePull,
			user: { ...basePull.user, login: "author@example.com" },
			base: { ...basePull.base, ref: "main", sha: repo.baseCommit },
			head: {
				...basePull.head,
				ref: "feature",
				sha: repo.headCommit,
			},
		}),
		getReposDownloadZipballArchiveMockHandler(({ params }) => {
			const ref = String(params.ref);
			return repo.zipForCommit(ref, `octocat-hello-world-${ref.slice(0, 7)}/`);
		}),
		getChecksListForRefMockHandler({
			total_count: 1,
			check_runs: [{ ...baseRun, name: "ci", conclusion: "success" }],
		}),
		getPullsListReviewsMockHandler([]),
		getPullsCreateReviewMockHandler(
			getPullsCreateReviewResponseMock({
				html_url:
					"https://github.com/octocat/hello-world/pull/42#pullrequestreview-1",
			}),
		),
		createGraphQlHandler(),
	];
}
