import { env } from "node:process";
import { GraphQLClient } from "graphql-request";
import {
	checksListForRef,
	pullsGet,
	pullsListReviews,
} from "../../../clients/github.g.ts";
import type { AccessToken } from "../../domain/access-token.ts";
import type { GithubPullRequest } from "../../domain/code-under-review.ts";
import type {
	GitHub,
	HeadCommit,
	HostError,
	Ledger,
	Outcome,
	Summary,
} from "../../domain/contracts.g.ts";
import type {
	AdapterResolution,
	HostAdapter,
} from "../../domain/host-adapter.ts";
import { isNullOrEmpty } from "../../domain/nullish.ts";
import {
	refusalRecorder,
	reviewBaselineFrom,
} from "../../domain/review-baseline.ts";
import { buildReviewSnapshot } from "../../domain/review-snapshot-builder.ts";
import type { SnapshotDirectory } from "../../domain/snapshot-directory.ts";
import {
	buildHostError,
	type HostHttpResponse,
	type HostTransport,
	hasOauthScope,
	isJsonResponse,
	tokenHttpTransport,
	transportFromEnv,
} from "../http-transport.ts";
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

const GRAPHQL_URL = "https://api.github.com/graphql";

export class GitHubAdapter implements HostAdapter<GitHub> {
	readonly #review: GithubPullRequest;
	readonly #transport: HostTransport;
	private constructor(review: GithubPullRequest, transport: HostTransport) {
		this.#review = review;
		this.#transport = transport;
	}
	static from(review: GithubPullRequest): GitHubAdapter {
		const { GH_TOKEN } = env;
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
	async #resolveSnapshot(
		snapshotDir: SnapshotDirectory,
		pr: ReturnType<typeof GitHubPullRequestCodec.decode>,
		headCommit: HeadCommit,
		init: ReturnType<HostTransport["requestInit"]>,
	): Promise<AdapterResolution> {
		const host = this.host();
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
				headers: new Headers(),
				data: {
					message: "Viewer does not have permission to update pull request.",
				},
			});
		}
		return this.#finalizeResolution({
			snapshotDir,
			pr,
			headCommit,
			change,
			init,
			reviews: GitHubReviewsCodec.decode(reviewsRes.data),
			checksData: checksRes.data,
			threads: threadsRes.threads,
		});
	}
	async #finalizeResolution(input: {
		readonly snapshotDir: SnapshotDirectory;
		readonly pr: ReturnType<typeof GitHubPullRequestCodec.decode>;
		readonly headCommit: HeadCommit;
		readonly change: ReturnType<typeof changeOf>;
		readonly init: ReturnType<HostTransport["requestInit"]>;
		readonly reviews: ReturnType<typeof GitHubReviewsCodec.decode>;
		readonly checksData: Parameters<typeof GitHubCheckRunsCodec.decode>[0];
		readonly threads: Parameters<typeof buildReviewSnapshot>[2]["threads"];
	}): Promise<AdapterResolution> {
		const {
			snapshotDir,
			pr,
			headCommit,
			change,
			init,
			reviews,
			checksData,
			threads,
		} = input;
		const host = this.host();
		const already = postedAt(reviews, headCommit);
		if (!isNullOrEmpty(already)) {
			return { kind: "already-reviewed", headCommit, location: already };
		}
		const refuse = refusalRecorder(refusedIn(reviews, headCommit), (c, msg) =>
			refuseGitHubReview({
				host,
				init,
				headCommit: c,
				reason: msg,
				onError: (res) => this.#hostError(res),
			}),
		);
		const reasons = refusalReasons(
			pr.mergeable_state,
			failedChecks(GitHubCheckRunsCodec.decode(checksData)),
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
		const zipArchives = await downloadGitHubCommitZips({
			host,
			commits: baseline.commitsToFetch(baseCommit, headCommit),
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
			{ baseCommit, headCommit, change, baseline, threads },
			refuse,
		);
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
				hasOauthScope(prRes.headers, ["repo", "public_repo"]) &&
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
		return this.#resolveSnapshot(snapshotDir, pr, headCommit, init);
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
