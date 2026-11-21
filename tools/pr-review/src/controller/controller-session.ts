import { z } from "zod";
import type { CodeUnderReview } from "../domain/code-under-review.ts";
import type {
	PersistedPullRequest,
	PrepareError,
} from "../domain/contracts.g.ts";
import { coordinateLedgersWithClock } from "../domain/coordinate-ledgers.ts";
import type {
	AdapterResolution,
	HostAdapter,
	HostAdapterPort,
} from "../domain/host-adapter.ts";
import type {
	CoordinatedProbeSpec,
	MainAgentLedger,
} from "../domain/main-agent-ledger.ts";
import { isNullOrEmpty } from "../domain/nullish.ts";
import type { ProbeCatalogPort, WorkspacePort } from "../domain/ports.ts";
import {
	loadPersistedProbes,
	type NamedProbe,
} from "../domain/probe-document.ts";

type ReadyReview = Extract<AdapterResolution, { readonly kind: "ready" }>;

type PrepareResult =
	| { readonly success: true; readonly data: ReadyReview }
	| { readonly success: false; readonly error: PrepareError };

interface PreparedSession {
	readonly adapter: HostAdapter;
	readonly pullRequest: CodeUnderReview;
	readonly probes: readonly NamedProbe[];
	readonly mainLedger: MainAgentLedger;
}

const bindSession = (
	sessions: Map<string, PreparedSession>,
	input: {
		readonly workdir: WorkspacePort;
		readonly adapter: HostAdapter;
		readonly pullRequest: CodeUnderReview;
		readonly probes: readonly NamedProbe[];
		readonly now: () => number;
	},
): PreparedSession => {
	const { workdir, adapter, pullRequest, probes, now } = input;
	const specs = probes.map(({ name, probe }): CoordinatedProbeSpec => {
		if (probe.kind === "context") {
			return { name, kind: "context", probe };
		}
		return { name, kind: probe.kind, probe };
	});
	const { mainLedger } = coordinateLedgersWithClock(
		workdir.ledgerDirectory(),
		pullRequest,
		{ specs, now },
	);
	const session: PreparedSession = {
		adapter,
		pullRequest,
		probes,
		mainLedger,
	};
	sessions.set(workdir.toString(), session);
	return session;
};

const rehydrateSession = (options: {
	readonly workdir: WorkspacePort;
	readonly load: (persisted: PersistedPullRequest) => {
		readonly pullRequest: CodeUnderReview;
		readonly adapter: HostAdapter;
	};
	readonly sessions: Map<string, PreparedSession>;
	readonly now: () => number;
}): PreparedSession => {
	const { workdir, load, sessions, now } = options;
	const persisted = workdir.ledgerDirectory().readPullRequest();
	const { pullRequest, adapter } = load(persisted);
	const probes = loadPersistedProbes(
		workdir.readAudits(),
		persisted.surface,
		workdir.ledgerDirectory().readRulesets(),
	);
	return bindSession(sessions, {
		workdir,
		adapter,
		pullRequest,
		probes,
		now,
	});
};

const sessionForWorkdir = (options: {
	readonly workdir: WorkspacePort;
	readonly adapters: HostAdapterPort;
	readonly sessions: Map<string, PreparedSession>;
	readonly now: () => number;
}): PreparedSession => {
	const { workdir, adapters, sessions, now } = options;
	const existing = sessions.get(workdir.toString());
	if (!isNullOrEmpty(existing)) {
		const diskUpdated = existing.mainLedger
			.pending()
			.some(
				(name) => !isNullOrEmpty(workdir.ledgerDirectory().readSlice(name)),
			);
		if (diskUpdated) {
			return bindSession(sessions, {
				workdir,
				adapter: existing.adapter,
				pullRequest: existing.pullRequest,
				probes: existing.probes,
				now,
			});
		}
		return existing;
	}
	return rehydrateSession({
		workdir,
		load: (persisted) => adapters.rehydrate(persisted),
		sessions,
		now,
	});
};

const toPersistedPullRequest = (
	resolved: ReadyReview,
	surface: PersistedPullRequest["surface"],
	rawToken: string | null,
): PersistedPullRequest => {
	const base = {
		change: resolved.change,
		surface,
		fragments: [...resolved.snapshot.fragments()],
		threads: resolved.snapshot.threads(),
	};
	if (rawToken !== null) {
		return { ...base, token: rawToken };
	}
	return base;
};

const prepareWithAdapter = async (input: {
	readonly workdir: WorkspacePort;
	readonly parsedAdapter: z.ZodSafeParseResult<HostAdapter>;
	readonly loadProbes: ProbeCatalogPort;
	readonly sessions: Map<string, PreparedSession>;
	readonly rawToken: string | null;
	readonly now: () => number;
}): Promise<PrepareResult> => {
	const { workdir, parsedAdapter, loadProbes, sessions, rawToken, now } = input;
	if (!parsedAdapter.success) {
		return {
			success: false,
			error: {
				kind: "invalid-target",
				message: z.prettifyError(parsedAdapter.error),
			},
		};
	}
	const resolved = await parsedAdapter.data.resolve(
		workdir.snapshotDirectory(),
	);
	if (resolved.kind !== "ready") {
		return { success: false, error: resolved };
	}
	const surface = {
		headCommit: resolved.headCommit,
		files: [...resolved.snapshot.surface()],
	};
	const { probes, rulesets } = await loadProbes(
		resolved.change,
		surface,
		workdir.snapshotDirectory().toString(),
	);
	workdir
		.ledgerDirectory()
		.writePullRequest(toPersistedPullRequest(resolved, surface, rawToken));
	workdir.ledgerDirectory().writeRulesets(rulesets);
	for (const entry of probes) {
		workdir.writeAudit(entry.name, entry.auditDocument);
	}
	bindSession(sessions, {
		workdir,
		adapter: parsedAdapter.data,
		pullRequest: resolved.snapshot,
		probes,
		now,
	});
	return { success: true, data: resolved };
};

export type { PreparedSession, PrepareResult };
export { prepareWithAdapter, sessionForWorkdir };
