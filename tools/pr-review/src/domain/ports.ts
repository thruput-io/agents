import type { z } from "zod";
import type {
	AgentInstructions,
	Change,
	Checkout,
	DefineSuccess,
	Ledger,
	Path,
	PersistedPullRequest,
	PersistedSubmission,
	RepositoryPath,
	Rulebook,
	SessionToken,
	Summary,
	Surface,
} from "./contracts.g.ts";
import type { BundledProbes, PersistedAudit } from "./probe-document.ts";

interface CommitZipArchive {
	readonly sha: string;
	readonly zip: Blob;
}

interface LedgerStore {
	initialize: () => void;
	writePullRequest: (pr: PersistedPullRequest) => void;
	readPullRequest: () => PersistedPullRequest;
	writeRulesets: (rulesets: readonly Rulebook[]) => void;
	readRulesets: () => readonly Rulebook[];
	writeAck: (name: string, acknowledgedAt: number) => void;
	readAck: (name: string) => number | null;
	writeCursor: (name: string, index: number) => void;
	readCursor: (name: string) => number | null;
	writeSlice: (name: string, ledger: Ledger) => void;
	readSlice: (name: string) => Ledger | null;
	writeSubmission: (submission: PersistedSubmission) => void;
	readSubmission: () => PersistedSubmission | null;
	equals: (other: LedgerStore) => boolean;
	toString: () => Checkout;
}

interface SnapshotPort {
	gitRaw: (args: readonly string[]) => string;
	git: (args: readonly string[]) => string;
	clone: (remoteUrl: RepositoryPath) => void;
	loadCommitZips: (
		commits: readonly CommitZipArchive[],
		stripTopLevelDir: boolean,
	) => Promise<void>;
	numstat: (fromCommit: string, toCommit: string) => string;
	diff: (fromCommit: string, toCommit: string) => string;
	resolveRef: (ref: string) => string;
	readTextFile: (relativePath: Path) => string | null;
	equals: (other: SnapshotPort) => boolean;
	toString: () => Checkout;
}

interface WorkspacePort {
	ledgerDirectory: () => LedgerStore;
	snapshotDirectory: () => SnapshotPort;
	writeAudit: (name: Checkout, document: AgentInstructions) => void;
	readAudits: () => readonly PersistedAudit[];
	sessionToken: () => Checkout;
	warning: () => Summary | null;
	equals: (other: WorkspacePort) => boolean;
	toString: () => Checkout;
}

interface WorkspaceFactoryPort {
	from: (rawPath: Checkout) => z.ZodSafeParseResult<WorkspacePort>;
	open: (rawPath: Checkout) => z.ZodSafeParseResult<WorkspacePort>;
	fromSession: (
		sessionOrWorkdir: Checkout,
	) => z.ZodSafeParseResult<WorkspacePort>;
}

type ProbeCatalogPort = (
	change: Change,
	surface: Surface,
	checkout: Checkout,
	session: SessionToken,
) => Promise<BundledProbes>;

type DefineLookupResult =
	| { readonly success: true; readonly data: DefineSuccess }
	| { readonly success: false; readonly error: string };

export type {
	CommitZipArchive,
	DefineLookupResult,
	LedgerStore,
	ProbeCatalogPort,
	SnapshotPort,
	WorkspaceFactoryPort,
	WorkspacePort,
};
