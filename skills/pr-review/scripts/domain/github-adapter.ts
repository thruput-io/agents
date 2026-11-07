import { GraphQLClient } from "graphql-request";
import {
	checksListForRef,
	type PullRequest,
	type PullRequestReview,
	pullsCreateReview,
	pullsGet,
	pullsListReviews,
} from "../../clients/github.g.ts";
import { AccessToken } from "./access-token.ts";
import type { AdapterResolution, HostAdapter } from "./adapter.ts";
import type { GithubPullRequest } from "./code-under-review.ts";
import {
	type GitHub,
	type HeadCommit,
	type Ledger,
	type Outcome,
	RefSchema,
	type Summary,
} from "./contracts.g.ts";
import {
	changeOf,
	failedChecks,
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
		return new GitHubAdapter(review, envToken.success ? envToken.data : null);
	}
	static fromWithToken(
		review: GithubPullRequest,
		token: AccessToken,
	): GitHubAdapter {
		return new GitHubAdapter(review, token);
	}
	host(): GitHub {
		return this.#review.host();
	}
	#requestInit(): { readonly headers: Readonly<Record<string, string>> } {
		return isNullOrEmpty(this.#token)
			? { headers: {} }
			: this.#token.requestInit();
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
		return (created.data as PullRequestReview).html_url;
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
		const pr = prRes.data as PullRequest;
		const headCommit = headCommitOf(pr);
		const change = changeOf(host, pr);
		const [checksRes, reviewsRes] = await Promise.all([
			checksListForRef(host.owner, host.repository, headCommit, {}, init),
			pullsListReviews(host.owner, host.repository, host.number, {}, init),
		]);
		const reviews = reviewsRes.data;
		const already = postedAt(reviews, headCommit);
		if (!isNullOrEmpty(already)) {
			return {
				kind: "already-reviewed",
				headCommit,
				location: already,
			};
		}
		const existingRefusal = refusedIn(reviews, headCommit);
		const reasons = refusalReasons(
			pr.mergeable_state,
			failedChecks(checksRes.data.check_runs),
		);
		if (reasons.length > 0) {
			const reason = reasons.join(", ");
			const location = isNullOrEmpty(existingRefusal)
				? await this.#refuse(headCommit, reason)
				: existingRefusal;
			return {
				kind: "refused",
				headCommit,
				reason,
				location,
			};
		}
		const client = new GraphQLClient(GRAPHQL_URL, init);
		const threads = await fetchGitHubThreads(client, host, change.author);
		return hydrateSnapshot(
			this.#review,
			snapshotDir,
			{
				remoteUrl: remoteUrlOf(host, pr),
				baseRef: RefSchema.parse(pr.base.ref),
				headRef: headCommit,
				headCommit,
				change,
				priorCommit: priorOf(reviews),
				threads,
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
		const existingUrl = postedAt(reviewsRes.data, outcome.headCommit);
		const location = isNullOrEmpty(existingUrl)
			? (
					(
						await pullsCreateReview(
							host.owner,
							host.repository,
							host.number,
							payload(outcome, table(ledger)),
							init,
						)
					).data as PullRequestReview
				).html_url
			: existingUrl;
		const client = new GraphQLClient(GRAPHQL_URL, init);
		await settleAndReopenGitHubThreads(client, outcome.settle, outcome.reopen);
		return location;
	}
}
