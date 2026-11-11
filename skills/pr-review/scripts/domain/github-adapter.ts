import { GraphQLClient } from "graphql-request";
import {
	checksListForRef,
	pullsCreateReview,
	pullsGet,
	pullsListReviews,
} from "../../clients/github.g.ts";
import { AccessToken } from "./access-token.ts";
import {
	type AdapterResolution,
	type HostAdapter,
	hasOAuthScope,
	hostErrorReason,
	isJsonResponse,
} from "./adapter.ts";
import type { GithubPullRequest } from "./code-under-review.ts";
import type {
	GitHub,
	HeadCommit,
	Ledger,
	Outcome,
	Summary,
} from "./contracts.g.ts";
import {
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
	remoteUrlOf,
} from "./github.ts";
import { payload, refusalPayload } from "./github-review.ts";
import {
	fetchGitHubThreads,
	settleAndReopenGitHubThreads,
} from "./github-threads.ts";
import { table } from "./ledger-table.ts";
import { isNullOrEmpty } from "./nullish.ts";
import type { SnapshotDirectory } from "./snapshot-directory.ts";
import { hydrateSnapshot } from "./snapshot-hydration.ts";

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
	}): AdapterResolution {
		return {
			kind: "host-error",
			host: this.host(),
			status: res.status,
			reason: hostErrorReason("GitHub", "GH_TOKEN", res, this.#token),
		};
	}
	async #refuse(headCommit: HeadCommit, reason: Summary): Promise<Summary> {
		const host = this.host();
		const created = await pullsCreateReview(
			host.owner,
			host.repository,
			host.number,
			refusalPayload(headCommit, reason),
			this.#requestInit(),
		);
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
			return this.#hostError({ status: 403, headers: prRes.headers });
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
			return this.#hostError({ status: 403, headers: prRes.headers });
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
			return { kind: "refused", headCommit, reason, location };
		}
		return hydrateSnapshot(
			this.#review,
			snapshotDir,
			{
				remoteUrl: remoteUrlOf(host, pr),
				baseRef: pr.base.ref,
				headRef: headCommit,
				headCommit,
				change,
				priorCommit: priorOf(reviews),
				threads: threadsRes.threads,
				existingRefusal,
			},
			(commit, reason) => this.#refuse(commit, reason),
		);
	}
	async post(outcome: Outcome, ledger: Ledger): Promise<Summary> {
		const host = this.host();
		const init = this.#requestInit();
		const reviewsRes = await pullsListReviews(
			host.owner,
			host.repository,
			host.number,
			{},
			init,
		);
		const reviews = isJsonResponse(reviewsRes)
			? GitHubReviewsCodec.decode(reviewsRes.data)
			: [];
		const existingUrl = postedAt(reviews, outcome.headCommit);
		const location = isNullOrEmpty(existingUrl)
			? GitHubCreatedReviewCodec.decode(
					(
						await pullsCreateReview(
							host.owner,
							host.repository,
							host.number,
							payload(outcome, table(ledger)),
							init,
						)
					).data,
				).html_url
			: existingUrl;
		const client = new GraphQLClient(GRAPHQL_URL, init);
		await settleAndReopenGitHubThreads(client, outcome.settle, outcome.reopen);
		return location;
	}
}
