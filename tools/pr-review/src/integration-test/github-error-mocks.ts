import { HttpResponse, http } from "msw";
import { nonnull } from "../domain/nullish.ts";
import {
	getChecksListForRefMockHandler,
	getChecksListForRefResponseMock,
	getPullsGetResponseMock,
} from "../generated/github/github.g.ts";
import type { ScenarioRepo } from "./scenario-repo.ts";

const TOTAL_COUNT_KEY = "total_count";
const CHECK_RUNS_KEY = "check_runs";
const MERGEABLE_STATE_KEY = "mergeable_state";
const CHANGED_FILES_KEY = "changed_files";

export function createFailedGitHubChecksHandler(name: string) {
	const baseRun = nonnull(getChecksListForRefResponseMock().check_runs[0]);
	return getChecksListForRefMockHandler({
		[TOTAL_COUNT_KEY]: 1,
		[CHECK_RUNS_KEY]: [{ ...baseRun, name, conclusion: "failure" }],
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

export function createReadOnlyOauthScopesGitHubHandler(repo: ScenarioRepo) {
	const basePull = getPullsGetResponseMock({
		number: 42,
		[MERGEABLE_STATE_KEY]: "clean",
		additions: 10,
		deletions: 2,
		[CHANGED_FILES_KEY]: 2,
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
