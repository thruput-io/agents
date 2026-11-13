import { GraphQLClient } from "graphql-request";
import {
	checksListForRef,
	pullsCreateReview,
	pullsGet,
	pullsListReviews,
	reposDownloadZipballArchive,
} from "../../clients/github.g.ts";
import { AccessToken } from "./access-token.ts";
import {
	type AdapterResolution,
	buildBinaryHostError,
	buildHostError,
	type HostAdapter,
	hasOAuthScope,
	isBinaryResponse,
	isJsonResponse,
} from "./adapter.ts";
import type { GithubPullRequest } from "./code-under-review.ts";
import type {
	GitHub,
	HeadCommit,
	HostError,
	Ledger,
	Outcome,
	Summary,
} from "./contracts.g.ts";
import {
	baseCommitOf,
	changeOf,
	failedChecks,
	GitHubCheckRunsCodec,
	GitHubCreatedReviewCodec,
	GitHubPullRequestCodec,
	GitHubReviewsCodec,
	headCommitOf,
	postedAt,
	priorOf,
	refusalReasons,
	refusedIn,
} from "./github.ts";
import { payload, refusalPayload } from "./github-review.ts";
import {
	fetchGitHubThreads,
	settleAndReopenGitHubThreads,
} from "./github-threads.ts";
import { table } from "./ledger-table.ts";
import { isNullOrEmpty } from "./nullish.ts";
import { buildReviewSnapshot } from "./review-snapshot-builder.ts";
import type {
	CommitZipArchive,
	SnapshotDirectory,
} from "./snapshot-directory.ts";

const GRAPHQL_URL = "https://api.github.com/graphql";

const githubTokenOf = (token: AccessToken): AccessToken =>
	token.isBasic() ? token : token.toBearer();

export class GitHubAdapter implements HostAdapter<GitHub> {
	readonly #review: GithubPullRequest;
	readonly #token: AccessToken | null;
	private constructor(review: GithubPullRequest, token: AccessToken | null) {
		this.#review = review;
		this.#token = token;
	}
	static from(review: GithubPullRequest): GitHubAdapter {
		const { GH_TOKEN } = process.env;
		const envToken = AccessToken.from(GH_TOKEN ?? "");
		return new GitHubAdapter(
			review,
			envToken.success ? githubTokenOf(envToken.data) : null,
		);
	}
	static fromWithToken(
		review: GithubPullRequest,
		token: AccessToken,
	): GitHubAdapter {
		return new GitHubAdapter(review, githubTokenOf(token));
	}
	host(): GitHub {
		return this.#review.host();
	}
	#requestInit(): { readonly headers: Readonly<Record<string, string>> } {
		return isNullOrEmpty(this.#token)
			? { headers: { accept: "application/json" } }
			: this.#token.requestInit();
	}
	#hostError(res: {
		readonly status: number;
		readonly headers: Headers;
		readonly data?: unknown;
	}): HostError {
		return buildHostError(this.host(), res, this.#token);
	}
	async #refuse(
		headCommit: HeadCommit,
		reason: Summary,
	): Promise<Summary | HostError> {
		const host = this.host();
		const created = await pullsCreateReview(
			host.owner,
			host.repository,
			host.number,
			refusalPayload(headCommit, reason),
			this.#requestInit(),
		);
		if (!isJsonResponse(created)) {
			return this.#hostError(created);
		}
		return GitHubCreatedReviewCodec.decode(created.data).html_url;
	}
	async resolve(snapshotDir: SnapshotDirectory): Promise<AdapterResolution> {
		const host = this.host();
		const init = this.#requestInit();
		const prRes = await pullsGet(
			host.owner,
			host.repository,
			host.number,
			init,
		);
		if (!isJsonResponse(prRes)) {
			return this.#hostError(prRes);
		}
		if (
			!(
				hasOAuthScope(prRes.headers, ["repo", "public_repo"]) &&
				(this.#token?.hasScope(["repo", "public_repo"]) ?? true)
			)
		) {
			return this.#hostError({
				status: 403,
				headers: prRes.headers,
				data: {
					message:
						"Access token is missing required GitHub OAuth scope (repo or public_repo).",
				},
			});
		}
		const pr = GitHubPullRequestCodec.decode(prRes.data);
		const headCommit = headCommitOf(pr);
		const change = changeOf(host, pr);
		const client = new GraphQLClient(GRAPHQL_URL, init);
		const [checksRes, reviewsRes, threadsRes] = await Promise.all([
			checksListForRef(host.owner, host.repository, headCommit, {}, init),
			pullsListReviews(host.owner, host.repository, host.number, {}, init),
			fetchGitHubThreads(client, host, change.author),
		]);
		if (!isJsonResponse(checksRes)) {
			return this.#hostError(checksRes);
		}
		if (!isJsonResponse(reviewsRes)) {
			return this.#hostError(reviewsRes);
		}
		if (!threadsRes.ok) {
			return this.#hostError(threadsRes);
		}
		if (!threadsRes.viewerCanUpdate) {
			return this.#hostError({
				status: 403,
				headers: prRes.headers,
				data: {
					message: "Viewer does not have permission to update pull request.",
				},
			});
		}
		const reviews = GitHubReviewsCodec.decode(reviewsRes.data);
		const already = postedAt(reviews, headCommit);
		if (!isNullOrEmpty(already)) {
			return { kind: "already-reviewed", headCommit, location: already };
		}
		const existingRefusal = refusedIn(reviews, headCommit);
		const reasons = refusalReasons(
			pr.mergeable_state,
			failedChecks(GitHubCheckRunsCodec.decode(checksRes.data)),
		);
		if (reasons.length > 0) {
			const reason = reasons.join(", ");
			const location = isNullOrEmpty(existingRefusal)
				? await this.#refuse(headCommit, reason)
				: existingRefusal;
			if (typeof location !== "string") {
				return location;
			}
			return { kind: "refused", headCommit, reason, location };
		}
		const baseCommit = baseCommitOf(pr);
		const priorCommit = priorOf(reviews);
		const commitsToFetch = [
			baseCommit,
			...(isNullOrEmpty(priorCommit) ? [] : [priorCommit]),
			headCommit,
		];
		const zipResponses = await Promise.all(
			commitsToFetch.map(async (sha) => ({
				sha,
				res: await reposDownloadZipballArchive(
					host.owner,
					host.repository,
					sha,
					init,
				),
			})),
		);
		const failedZip = zipResponses.find(({ res }) => !isBinaryResponse(res));
		if (!isNullOrEmpty(failedZip)) {
			return buildBinaryHostError(host, failedZip.res, this.#token);
		}
		const zipArchives: CommitZipArchive[] = zipResponses.map(
			({ sha, res }) => ({
				sha,
				zip: res.data,
			}),
		);
		await snapshotDir.loadCommitZips(zipArchives, true);
		return buildReviewSnapshot(
			this.#review,
			snapshotDir,
			{
				baseCommit,
				headCommit,
				change,
				priorCommit,
				threads: threadsRes.threads,
				existingRefusal,
			},
			(commit, reason) => this.#refuse(commit, reason),
		);
	}
	async post(outcome: Outcome, ledger: Ledger): Promise<Summary | HostError> {
		const host = this.host();
		const init = this.#requestInit();
		const reviewsRes = await pullsListReviews(
			host.owner,
			host.repository,
			host.number,
			{},
			init,
		);
		if (!isJsonResponse(reviewsRes)) {
			return this.#hostError(reviewsRes);
		}
		const reviews = GitHubReviewsCodec.decode(reviewsRes.data);
		const existingUrl = postedAt(reviews, outcome.headCommit);
		let location = existingUrl;
		if (isNullOrEmpty(location)) {
			const createRes = await pullsCreateReview(
				host.owner,
				host.repository,
				host.number,
				payload(outcome, table(ledger)),
				init,
			);
			if (!isJsonResponse(createRes)) {
				return this.#hostError(createRes);
			}
			location = GitHubCreatedReviewCodec.decode(createRes.data).html_url;
		}
		const client = new GraphQLClient(GRAPHQL_URL, init);
		const mutateRes = await settleAndReopenGitHubThreads(
			client,
			outcome.settle,
			outcome.reopen,
		);
		if (!mutateRes.ok) {
			return this.#hostError(mutateRes);
		}
		return location;
	}
}
