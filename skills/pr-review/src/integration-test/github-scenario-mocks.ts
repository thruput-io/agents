import { HttpResponse, http } from "msw";
import {
	getChecksListForRefMockHandler,
	getChecksListForRefResponseMock,
	getPullsCreateReviewResponseMock,
	getPullsGetMockHandler,
	getPullsGetResponseMock,
	getPullsListFilesMockHandler,
	getPullsListFilesResponseMock,
	getPullsListReviewsMockHandler,
	getPullsListReviewsResponseMock,
} from "../../clients/github.g.ts";
import { PullsCreateReviewBody } from "../../clients/github.zod.g.ts";
import { nonnull } from "../domain/nullish.ts";
import { SITE } from "../domain/rulebook.ts";
import {
	createForbiddenGitHubGraphQlHandler,
	createForbiddenGitHubZipballHandler,
} from "./github-error-mocks.ts";
import type { ScenarioRepo } from "./scenario-repo.ts";

const TOTAL_COUNT_KEY = "total_count";
const CHECK_RUNS_KEY = "check_runs";
const MERGEABLE_STATE_KEY = "mergeable_state";
const CHANGED_FILES_KEY = "changed_files";
const HTML_URL_KEY = "html_url";
const COMMIT_ID_KEY = "commit_id";

interface GitHubReviewRecord {
	readonly event: string;
	readonly commitId: string;
	readonly body: string;
	readonly comments: ReadonlyArray<{
		readonly path: string;
		readonly line: number;
		readonly side: string;
		readonly body: string;
	}>;
}

function createGitHubReviewRecorderHandler(recorded: GitHubReviewRecord[]) {
	return http.post(
		"https://api.github.com/repos/:owner/:repo/pulls/:pull_number/reviews",
		async ({ request }) => {
			const raw = (await request.json()) as Parameters<
				typeof PullsCreateReviewBody.decode
			>[0];
			const decoded = PullsCreateReviewBody.decode(raw);
			recorded.push({
				event: nonnull(decoded.event),
				commitId: nonnull(decoded.commit_id),
				body: nonnull(decoded.body),
				comments: nonnull(decoded.comments).map((c) => ({
					path: nonnull(c.path),
					line: nonnull(c.line),
					side: nonnull(c.side),
					body: nonnull(c.body),
				})),
			});
			return HttpResponse.json(
				getPullsCreateReviewResponseMock({
					[HTML_URL_KEY]:
						"https://github.com/octocat/hello-world/pull/42#pullrequestreview-101",
				}),
			);
		},
	);
}

function createInProgressGitHubChecksHandlers(
	name: string,
	postedReviews: string[],
) {
	const baseRun = nonnull(getChecksListForRefResponseMock().check_runs[0]);
	return [
		getChecksListForRefMockHandler({
			[TOTAL_COUNT_KEY]: 1,
			[CHECK_RUNS_KEY]: [
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
						[HTML_URL_KEY]:
							"https://github.com/octocat/hello-world/pull/42#pullrequestreview-99",
					}),
				);
			},
		),
	];
}

function createGitHubAlreadyReviewedHandler(headCommit: string) {
	const baseReview = nonnull(getPullsListReviewsResponseMock()[0]);
	return getPullsListReviewsMockHandler([
		{
			...baseReview,
			[COMMIT_ID_KEY]: headCommit,
			body: `**Verdict: approve**\n\n1 rules probed by 1 probes at ${headCommit} against [the rules](${SITE}): 0 violations`,
		},
	]);
}

function createGitHubExistingRefusalHandler(headCommit: string) {
	const baseReview = nonnull(getPullsListReviewsResponseMock()[0]);
	return getPullsListReviewsMockHandler([
		{
			...baseReview,
			body: `**Verdict: request-changes**\n\nNot reviewed at ${headCommit} against [the rules](${SITE}): check 'ci' is failure.`,
		},
	]);
}

function createOversizedGitHubPullHandlers(repo: ScenarioRepo) {
	const basePull = getPullsGetResponseMock({
		number: 42,
		[MERGEABLE_STATE_KEY]: "clean",
		additions: 2000,
		deletions: 300_000,
		[CHANGED_FILES_KEY]: 125,
	});
	const baseFile = nonnull(getPullsListFilesResponseMock()[0]);
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
		getPullsListFilesMockHandler([
			{
				...baseFile,
				filename: "src/huge.ts",
				status: "modified",
				additions: 2000,
				deletions: 300_000,
				changes: 302_000,
			},
		]),
		createForbiddenGitHubGraphQlHandler(),
		createForbiddenGitHubZipballHandler(),
	];
}

export {
	createGitHubAlreadyReviewedHandler,
	createGitHubExistingRefusalHandler,
	createGitHubReviewRecorderHandler,
	createInProgressGitHubChecksHandlers,
	createOversizedGitHubPullHandlers,
	type GitHubReviewRecord,
};
