import type {
	Change,
	Fragment,
	Ledger,
	LocationUrl,
	Surface,
	Threads,
} from "./contracts.g.ts";

export interface PullRequest {
	readonly change: Change;
	readonly surface: Surface;
	readonly fragments: readonly Fragment[];
	readonly threads: Threads;
}

export interface PullRequestRepository {
	read: () => Promise<PullRequest>;
	submit: (ledger: Ledger) => Promise<LocationUrl>;
}
