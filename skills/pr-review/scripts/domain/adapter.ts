import type {
	Change,
	HeadCommit,
	Host,
	Ledger,
	Outcome,
	Path,
	Ref,
	RepositoryPath,
	Summary,
	Thread,
} from "./contracts.g.ts";
import type { CodeUnderReviewSnapshot } from "./review-snapshot.ts";
import type { SnapshotDirectory } from "./snapshot-directory.ts";

export type AdapterResolution =
	| {
			readonly kind: "ready";
			readonly headCommit: HeadCommit;
			readonly change: Change;
			readonly snapshot: CodeUnderReviewSnapshot;
	  }
	| {
			readonly kind: "already-reviewed";
			readonly headCommit: HeadCommit;
			readonly location: Summary;
	  }
	| {
			readonly kind: "too-large";
			readonly headCommit: HeadCommit;
			readonly files: readonly Path[];
			readonly location: Summary;
	  }
	| {
			readonly kind: "refused";
			readonly headCommit: HeadCommit;
			readonly reason: Summary;
			readonly location: Summary;
	  };

export interface RemotePullRequest {
	readonly remoteUrl: RepositoryPath;
	readonly baseRef: Ref;
	readonly headRef: Ref;
	readonly headCommit: HeadCommit;
	readonly change: Change;
	readonly priorCommit: HeadCommit | null;
	readonly threads: readonly Thread[];
	readonly existingRefusal: Summary | null;
}

export interface HostAdapter<HostType extends Host = Host> {
	host: () => HostType;
	resolve: (snapshotDir: SnapshotDirectory) => Promise<AdapterResolution>;
	post: (outcome: Outcome, ledger: Ledger) => Promise<Summary>;
}
