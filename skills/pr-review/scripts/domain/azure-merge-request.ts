import { z } from "zod";
import {
	type CodeUnderReview,
	EMPTY_REVIEW,
	type ReviewState,
} from "./code-under-review.ts";
import {
	type AzureDevOps,
	AzureDevOpsSchema,
	type Fragment,
	type SurfaceFile,
	type Threads,
} from "./contracts.g.ts";

export class AzureMergeRequest implements CodeUnderReview {
	readonly #host: AzureDevOps;
	readonly #state: ReviewState;
	private constructor(host: AzureDevOps, state: ReviewState) {
		this.#host = host;
		this.#state = state;
	}
	static readonly SCHEMA = z.codec(
		AzureDevOpsSchema,
		z.custom<AzureMergeRequest>(
			(val): val is AzureMergeRequest => val instanceof AzureMergeRequest,
		),
		{
			decode: (host) => new AzureMergeRequest(host, EMPTY_REVIEW),
			encode: (review) => review.host(),
		},
	);
	static from(raw: AzureDevOps): z.ZodSafeParseResult<AzureMergeRequest> {
		return AzureMergeRequest.SCHEMA.safeDecode(raw);
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
