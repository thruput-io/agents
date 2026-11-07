import type { z } from "zod";
import {
	type AzureDevOps,
	AzureDevOpsSchema,
	type Fragment,
	type Git,
	type GitHub,
	GitHubSchema,
	GitSchema,
	type Host,
	type SurfaceFile,
	type Threads,
} from "./contracts.g.ts";

export type ReviewState = readonly [
	readonly SurfaceFile[],
	readonly Fragment[],
	Threads,
];
const EMPTY_REVIEW: ReviewState = [[], [], { threads: [] }];

export interface CodeUnderReview {
	host: () => Host;
	surface: () => readonly SurfaceFile[];
	fragments: () => readonly Fragment[];
	threads: () => Threads;
	withReview: (...state: ReviewState) => CodeUnderReview;
}

export class GithubPullRequest implements CodeUnderReview {
	readonly #host: GitHub;
	readonly #state: ReviewState;
	private constructor(host: GitHub, state: ReviewState) {
		this.#host = host;
		this.#state = state;
	}
	static readonly Schema = GitHubSchema.transform(
		(host) => new GithubPullRequest(host, EMPTY_REVIEW),
	);
	static from(raw: GitHub): z.ZodSafeParseResult<GithubPullRequest> {
		return GithubPullRequest.Schema.safeParse(raw);
	}
	host(): GitHub {
		return this.#host;
	}
	surface(): readonly SurfaceFile[] {
		return this.#state[0];
	}
	fragments(): readonly Fragment[] {
		return this.#state[1];
	}
	threads(): Threads {
		return this.#state[2];
	}
	withReview(...state: ReviewState): GithubPullRequest {
		return new GithubPullRequest(this.#host, state);
	}
}

export class AzureMergeRequest implements CodeUnderReview {
	readonly #host: AzureDevOps;
	readonly #state: ReviewState;
	private constructor(host: AzureDevOps, state: ReviewState) {
		this.#host = host;
		this.#state = state;
	}
	static readonly Schema = AzureDevOpsSchema.transform(
		(host) => new AzureMergeRequest(host, EMPTY_REVIEW),
	);
	static from(raw: AzureDevOps): z.ZodSafeParseResult<AzureMergeRequest> {
		return AzureMergeRequest.Schema.safeParse(raw);
	}
	host(): AzureDevOps {
		return this.#host;
	}
	surface(): readonly SurfaceFile[] {
		return this.#state[0];
	}
	fragments(): readonly Fragment[] {
		return this.#state[1];
	}
	threads(): Threads {
		return this.#state[2];
	}
	withReview(...state: ReviewState): AzureMergeRequest {
		return new AzureMergeRequest(this.#host, state);
	}
}

export class GitDiff implements CodeUnderReview {
	readonly #host: Git;
	readonly #state: ReviewState;
	private constructor(host: Git, state: ReviewState) {
		this.#host = host;
		this.#state = state;
	}
	static readonly Schema = GitSchema.transform(
		(host) => new GitDiff(host, EMPTY_REVIEW),
	);
	static from(raw: Git): z.ZodSafeParseResult<GitDiff> {
		return GitDiff.Schema.safeParse(raw);
	}
	host(): Git {
		return this.#host;
	}
	surface(): readonly SurfaceFile[] {
		return this.#state[0];
	}
	fragments(): readonly Fragment[] {
		return this.#state[1];
	}
	threads(): Threads {
		return this.#state[2];
	}
	withReview(...state: ReviewState): GitDiff {
		return new GitDiff(this.#host, state);
	}
}
