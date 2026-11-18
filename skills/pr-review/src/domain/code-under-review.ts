import { z } from "zod";
import {
	type Fragment,
	type GitHub,
	GitHubSchema,
	type Host,
	type PersistedPullRequest,
	type SurfaceFile,
	type Threads,
} from "./contracts.g.ts";

type ReviewState = readonly [
	readonly SurfaceFile[],
	readonly Fragment[],
	Threads,
];
const EMPTY_REVIEW: ReviewState = [[], [], { threads: [] }];

interface CodeUnderReview {
	host: () => Host;
	surface: () => readonly SurfaceFile[];
	fragments: () => readonly Fragment[];
	threads: () => Threads;
	withReview: (...state: ReviewState) => CodeUnderReview;
}

class GithubPullRequest implements CodeUnderReview {
	readonly #host: GitHub;
	readonly #state: ReviewState;
	private constructor(host: GitHub, state: ReviewState) {
		this.#host = host;
		this.#state = state;
	}
	static readonly SCHEMA = z.codec(
		GitHubSchema,
		z.custom<GithubPullRequest>(
			(val): val is GithubPullRequest => val instanceof GithubPullRequest,
		),
		{
			decode: (host) => new GithubPullRequest(host, EMPTY_REVIEW),
			encode: (review) => review.host(),
		},
	);
	static from(raw: GitHub): z.ZodSafeParseResult<GithubPullRequest> {
		return GithubPullRequest.SCHEMA.safeDecode(raw);
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

const createPersistedReview = (
	host: Host,
	state: ReviewState,
): CodeUnderReview => ({
	host: () => host,
	surface: () => state[0],
	fragments: () => state[1],
	threads: () => state[2],
	withReview: (...nextState) => createPersistedReview(host, nextState),
});

function rehydrateCodeUnderReview(
	persisted: PersistedPullRequest,
): CodeUnderReview {
	return createPersistedReview(persisted.change.host, [
		persisted.surface.files,
		persisted.fragments,
		persisted.threads,
	]);
}

export type { CodeUnderReview, ReviewState };
export { EMPTY_REVIEW, GithubPullRequest, rehydrateCodeUnderReview };
