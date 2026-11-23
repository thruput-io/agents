import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addMocksToSchema } from "@graphql-tools/mock";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { graphql as executeGraphQl } from "graphql";
import { HttpResponse, http } from "msw";
import { nonnull } from "../domain/nullish.ts";
import {
	getChecksListForRefMockHandler,
	getChecksListForRefResponseMock,
	getPullsCreateReviewMockHandler,
	getPullsCreateReviewResponseMock,
	getPullsGetMockHandler,
	getPullsGetResponseMock,
	getPullsListReviewsMockHandler,
	getReposDownloadZipballArchiveMockHandler,
} from "../generated/github/github.g.ts";
import type { ScenarioRepo } from "./scenario-repo.ts";

const TOTAL_COUNT_KEY = "total_count";
const CHECK_RUNS_KEY = "check_runs";
const MERGEABLE_STATE_KEY = "mergeable_state";
const CHANGED_FILES_KEY = "changed_files";
const HTML_URL_KEY = "html_url";
const PULL_REQUEST_MOCK_KEY = "PullRequest";
const THREAD_CONN_MOCK_KEY = ["PullRequestReviewThread", "Connection"].join("");
const SHORT_SHA_LENGTH = 7;

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
		[PULL_REQUEST_MOCK_KEY]: () => ({ viewerCanUpdate: true }),
		[THREAD_CONN_MOCK_KEY]: emptyThreadConnection,
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

function createGitHubHandlers(repo: ScenarioRepo) {
	const basePull = getPullsGetResponseMock({
		number: 42,
		body: "Refine helper\n\nSecond body.\n\nAdd y export\n\nFirst body.",
		[MERGEABLE_STATE_KEY]: "clean",
		additions: 10,
		deletions: 2,
		[CHANGED_FILES_KEY]: 2,
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
			return repo.zipForCommit(
				ref,
				`octocat-hello-world-${ref.slice(0, SHORT_SHA_LENGTH)}/`,
			);
		}),
		getChecksListForRefMockHandler({
			[TOTAL_COUNT_KEY]: 1,
			[CHECK_RUNS_KEY]: [{ ...baseRun, name: "ci", conclusion: "success" }],
		}),
		getPullsListReviewsMockHandler([]),
		getPullsCreateReviewMockHandler(
			getPullsCreateReviewResponseMock({
				[HTML_URL_KEY]:
					"https://github.com/octocat/hello-world/pull/42#pullrequestreview-1",
			}),
		),
		createGraphQlHandler(),
	];
}

export { createGitHubHandlers };
