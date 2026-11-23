import { env } from "node:process";
import type { AccessToken } from "../../domain/access-token.ts";
import type { GithubPullRequest } from "../../domain/code-under-review.ts";
import type {
	GitHub,
	HostError,
	Ledger,
	Outcome,
	Summary,
} from "../../domain/contracts.g.ts";
import type {
	AdapterResolution,
	HostAdapter,
} from "../../domain/host-adapter.ts";
import type { SnapshotPort } from "../../domain/ports.ts";
import { refusalRecorder } from "../../domain/review-baseline.ts";
import { pullsGet } from "../../generated/github/github.g.ts";
import { buildHostError } from "../http-error.ts";
import {
	type HostHttpResponse,
	type HostTransport,
	hasOauthScope,
	isJsonResponse,
	tokenHttpTransport,
	transportFromEnv,
} from "../http-transport.ts";
import { GitHubPullRequestCodec, headCommitOf } from "./github.ts";
import { postGitHubReview, refuseGitHubReview } from "./github-post.ts";
import {
	exceedsPullCounts,
	resolveOversizedGitHubPull,
} from "./github-pull-precheck.ts";
import { resolveGitHubSnapshot } from "./github-resolve.ts";

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
	async resolve(snapshotDir: SnapshotPort): Promise<AdapterResolution> {
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
		return resolveGitHubSnapshot({
			host,
			review: this.#review,
			transport: this.#transport,
			hostError: (res) => this.#hostError(res),
			snapshotDir,
			pr,
			headCommit,
			init,
		});
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
