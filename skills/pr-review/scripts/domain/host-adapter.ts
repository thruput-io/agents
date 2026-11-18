import type { z } from "zod";
import type { AccessToken } from "./access-token.ts";
import type { CodeUnderReview } from "./code-under-review.ts";
import type {
	AlreadyReviewed,
	Change,
	HeadCommit,
	Host,
	HostError,
	Ledger,
	Outcome,
	Refused,
	Summary,
	Thread,
	TooLarge,
} from "./contracts.g.ts";
import type { PersistedPullRequest } from "./ledger-directory.ts";
import type { ReviewBaseline } from "./review-baseline.ts";
import type { CodeUnderReviewSnapshot } from "./review-snapshot.ts";
import type { SnapshotDirectory } from "./snapshot-directory.ts";

type AdapterResolution =
	| {
			readonly kind: "ready";
			readonly headCommit: HeadCommit;
			readonly change: Change;
			readonly snapshot: CodeUnderReviewSnapshot;
	  }
	| AlreadyReviewed
	| TooLarge
	| Refused
	| HostError;

interface ReviewSnapshotInput {
	readonly baseCommit: HeadCommit;
	readonly headCommit: HeadCommit;
	readonly change: Change;
	readonly baseline: ReviewBaseline;
	readonly threads: readonly Thread[];
}

interface HostAdapter<HostType extends Host = Host> {
	host: () => HostType;
	resolve: (snapshotDir: SnapshotDirectory) => Promise<AdapterResolution>;
	post: (outcome: Outcome, ledger: Ledger) => Promise<Summary | HostError>;
}

interface HostAdapterPort {
	from: (url: string) => z.ZodSafeParseResult<HostAdapter>;
	fromWithToken: (
		url: string,
		token: AccessToken,
	) => z.ZodSafeParseResult<HostAdapter>;
	rehydrate: (persisted: PersistedPullRequest) => {
		readonly pullRequest: CodeUnderReview;
		readonly adapter: HostAdapter;
	};
	rehydrateWithToken: (
		persisted: PersistedPullRequest,
		token: AccessToken,
	) => {
		readonly pullRequest: CodeUnderReview;
		readonly adapter: HostAdapter;
	};
}

export type {
	AdapterResolution,
	HostAdapter,
	HostAdapterPort,
	ReviewSnapshotInput,
};
