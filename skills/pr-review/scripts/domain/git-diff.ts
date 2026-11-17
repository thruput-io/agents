import { z } from "zod";
import {
	type CodeUnderReview,
	EMPTY_REVIEW,
	type ReviewState,
} from "./code-under-review.ts";
import {
	type Fragment,
	type Git,
	GitSchema,
	type SurfaceFile,
	type Threads,
} from "./contracts.g.ts";

export class GitDiff implements CodeUnderReview {
	readonly #host: Git;
	readonly #state: ReviewState;
	private constructor(host: Git, state: ReviewState) {
		this.#host = host;
		this.#state = state;
	}
	static readonly SCHEMA = z.codec(
		GitSchema,
		z.custom<GitDiff>((val): val is GitDiff => val instanceof GitDiff),
		{
			decode: (host) => new GitDiff(host, EMPTY_REVIEW),
			encode: (review) => review.host(),
		},
	);
	static from(raw: Git): z.ZodSafeParseResult<GitDiff> {
		return GitDiff.SCHEMA.safeDecode(raw);
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
