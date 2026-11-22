import { z } from "zod";
import type {
	Checkout,
	Rulebook as ExternalRulebook,
	Ledger,
	Path,
	PersistedPullRequest,
	PersistedSubmission,
	Probe,
	RepositoryPath,
} from "../domain/contracts.g.ts";
import { nonnull } from "../domain/nullish.ts";
import type {
	CommitZipArchive,
	LedgerStore,
	SnapshotPort,
	WorkspaceFactoryPort,
	WorkspacePort,
} from "../domain/ports.ts";
import type { PersistedAudit } from "../domain/probe-document.ts";

const SESSION_PREFIX = "pr-review-session:";

const readFromMap = <T>(map: Map<string, T>, key: string): T | null => {
	const lookup: Readonly<Record<string, () => T | null>> = {
		true: () => nonnull(map.get(key)),
		false: () => null,
	};
	return nonnull(lookup[String(map.has(key))])();
};

function createMemoryLedgerStore(path: Checkout): LedgerStore {
	let pullRequest: PersistedPullRequest | null = null;
	let rulesets: readonly ExternalRulebook[] = [];
	let submission: PersistedSubmission | null = null;
	const acks = new Map<string, number>();
	const cursors = new Map<string, number>();
	const slices = new Map<string, Ledger>();

	return {
		initialize: () => {
			pullRequest = null;
			rulesets = [];
			submission = null;
			acks.clear();
			cursors.clear();
			slices.clear();
		},
		writePullRequest: (pr) => {
			pullRequest = pr;
		},
		readPullRequest: () => {
			if (pullRequest === null) {
				throw new Error("Missing pullRequest in memory ledger");
			}
			return pullRequest;
		},
		writeRulesets: (next) => {
			rulesets = next;
		},
		readRulesets: () => rulesets,
		writeAck: (name, acknowledgedAt) => {
			acks.set(name, acknowledgedAt);
		},
		readAck: (name) => readFromMap(acks, name),
		writeCursor: (name, index) => {
			cursors.set(name, index);
		},
		readCursor: (name) => readFromMap(cursors, name),
		writeSlice: (name, ledger) => {
			slices.set(name, ledger);
		},
		readSlice: (name) => readFromMap(slices, name),
		writeSubmission: (next) => {
			submission = next;
		},
		readSubmission: () => submission,
		equals: (other) => other.toString() === path,
		toString: () => path,
	};
}

function createMemorySnapshotPort(path: Checkout): SnapshotPort {
	return {
		gitRaw: () => "",
		git: () => "",
		clone: (remoteUrl: RepositoryPath) => {
			throw new Error(`Unexpected clone in memory snapshot: ${remoteUrl}`);
		},
		loadCommitZips: (
			_commits: readonly CommitZipArchive[],
			_stripTopLevelDir: boolean,
		) => Promise.resolve(),
		numstat: () => "",
		diff: () => "",
		resolveRef: (ref) => ref,
		readTextFile: (_relativePath: Path) => null,
		equals: (other) => other.toString() === path,
		toString: () => path,
	};
}

function createMemoryWorkspace(path: Checkout): WorkspacePort {
	const ledger = createMemoryLedgerStore(`${path}/../ledger`);
	const snapshot = createMemorySnapshotPort(`${path}/snapshot`);
	const audits = new Map<Checkout, Probe>();
	const token = `${SESSION_PREFIX}${Buffer.from(path, "utf-8").toString("base64url")}`;

	return {
		ledgerDirectory: () => ledger,
		snapshotDirectory: () => snapshot,
		writeAudit: (name, document) => {
			audits.set(name, document);
		},
		readAudits: () =>
			[...audits.entries()]
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([name, document]): PersistedAudit => ({ name, document })),
		sessionToken: () => token,
		warning: () => null,
		equals: (other) => other.toString() === path,
		toString: () => path,
	};
}

function createMemoryWorkspaceFactory(): WorkspaceFactoryPort {
	const workspaces = new Map<string, WorkspacePort>();
	const register = (path: Checkout): WorkspacePort => {
		const existing = workspaces.get(path);
		if (existing !== undefined) {
			return existing;
		}
		const created = createMemoryWorkspace(path);
		workspaces.set(path, created);
		return created;
	};

	const existingSchema = z.string().transform((path, ctx) => {
		const found = workspaces.get(path);
		if (found === undefined) {
			ctx.addIssue({
				code: "custom",
				message: `Workspace not found: ${path}`,
			});
			return z.NEVER;
		}
		return found;
	});

	return {
		from: (rawPath) =>
			z
				.string()
				.min(1)
				.transform((path) => register(path))
				.safeDecode(rawPath),
		open: (rawPath) => existingSchema.safeDecode(rawPath),
		fromSession: (sessionOrWorkdir) => {
			let decoded = sessionOrWorkdir;
			if (sessionOrWorkdir.startsWith(SESSION_PREFIX)) {
				decoded = Buffer.from(
					sessionOrWorkdir.slice(SESSION_PREFIX.length),
					"base64url",
				).toString("utf-8");
			}
			return existingSchema.safeDecode(decoded);
		},
	};
}

export {
	createMemoryLedgerStore,
	createMemoryWorkspace,
	createMemoryWorkspaceFactory,
};
