import { GraphQLClient } from "graphql-request";
import {
	checksListForRef,
	pullsGet,
	pullsListReviews,
} from "../../clients/github.g.ts";
import type { AccessToken } from "./access-token.ts";
import {
	type AdapterResolution,
	buildHostError,
	type HostAdapter,
	type HostHttpResponse,
	type HostTransport,
	hasOAuthScope,
	isJsonResponse,
	tokenHttpTransport,
	transportFromEnv,
} from "./adapter.ts";
import type { GithubPullRequest } from "./code-under-review.ts";
import type {
	GitHub,
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
	GitHubPullRequestCodec,
	GitHubReviewsCodec,
	headCommitOf,
	postedAt,
	priorOf,
	refusalReasons,
	refusedIn,
} from "./github.ts";
import { postGitHubReview, refuseGitHubReview } from "./github-post.ts";
import {
	downloadGitHubCommitZips,
	exceedsPullCounts,
	resolveOversizedGitHubPull,
} from "./github-pull-precheck.ts";
import { fetchGitHubThreads } from "./github-threads.ts";
import { isNullOrEmpty } from "./nullish.ts";
import { refusalRecorder, reviewBaselineFrom } from "./review-baseline.ts";
import { buildReviewSnapshot } from "./review-snapshot-builder.ts";
import type { SnapshotDirectory } from "./snapshot-directory.ts";

const GRAPHQL_URL = "https://api.github.com/graphql";

export class GitHubAdapter implements HostAdapter<GitHub> {
	readonly #review: GithubPullRequest;
	readonly #transport: HostTransport;
	private constructor(review: GithubPullRequest, transport: HostTransport) {
		this.#review = review;
		this.#transport = transport;
	}
	static from(review: GithubPullRequest): GitHubAdapter {
		const { GH_TOKEN } = process.env;
		return new GitHubAdapter(
			review,
			transportFromEnv(GH_TOKEN, (token) => token.forGitHub()),
		);
	}
	static fromWithToken(
		review: GithubPullRequest,
		token: AccessToken,
	): GitHubAdapter {
		return new GitHubAdapter(review, tokenHttpTransport(token.forGitHub()));
	}
	host(): GitHub {
		return this.#review.host();
	}
	#hostError(res: HostHttpResponse): HostError {
		return buildHostError(this.host(), res, this.#transport);
	}
	async resolve(snapshotDir: SnapshotDirectory): Promise<AdapterResolution> {
		const host = this.host();
		const init = this.#transport.requestInit();
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
				this.#transport.hasScope(["repo", "public_repo"])
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
		if (exceedsPullCounts(pr)) {
			return resolveOversizedGitHubPull({
				host,
				pr,
				headCommit,
				init,
				onError: (err) => this.#hostError(err),
				refuseLocation: (commit, existing, reason) =>
					refusalRecorder(existing, (head, msg) =>
						refuseGitHubReview({
							host,
							init,
							headCommit: head,
							reason: msg,
							onError: (res) => this.#hostError(res),
						}),
					)(commit, reason),
			});
		}
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
		const refuse = refusalRecorder(existingRefusal, (commit, reason) =>
			refuseGitHubReview({
				host,
				init,
				headCommit: commit,
				reason,
				onError: (res) => this.#hostError(res),
			}),
		);
		const reasons = refusalReasons(
			pr.mergeable_state,
			failedChecks(GitHubCheckRunsCodec.decode(checksRes.data)),
		);
		if (reasons.length > 0) {
			const reason = reasons.join(", ");
			const location = await refuse(headCommit, reason);
			if (typeof location !== "string") {
				return location;
			}
			return { kind: "refused", headCommit, reason, location };
		}
		const baseCommit = baseCommitOf(pr);
		const baseline = reviewBaselineFrom(priorOf(reviews));
		const commits = baseline.commitsToFetch(baseCommit, headCommit);
		const zipArchives = await downloadGitHubCommitZips({
			host,
			commits,
			init,
			token: this.#transport,
		});
		if (!Array.isArray(zipArchives)) {
			return zipArchives;
		}
		await snapshotDir.loadCommitZips(zipArchives, true);
		return buildReviewSnapshot(
			this.#review,
			snapshotDir,
			{
				baseCommit,
				headCommit,
				change,
				baseline,
				threads: threadsRes.threads,
			},
			refuse,
		);
	}
	post(outcome: Outcome, ledger: Ledger): Promise<Summary | HostError> {
		return postGitHubReview({
			host: this.host(),
			init: this.#transport.requestInit(),
			outcome,
			ledger,
			onError: (res) => this.#hostError(res),
		});
	}
}
