import { z } from "zod";
import type { AccessToken } from "../domain/access-token.ts";
import type { CodeUnderReview } from "../domain/code-under-review.ts";
import type { DispatchResult, PrepareError } from "../domain/contracts.g.ts";
import type {
	AdapterResolution,
	HostAdapter,
	HostAdapterPort,
} from "../domain/host-adapter.ts";
import {
	type CoordinatedProbeSpec,
	coordinateLedgers,
	type MainAgentLedger,
} from "../domain/main-agent-ledger.ts";
import { isNullOrEmpty, nonnull } from "../domain/nullish.ts";
import {
	loadBundledProbes,
	loadPersistedProbes,
	type NamedProbe,
} from "../domain/probe-loader.ts";
import type { Workdir } from "../domain/workdir.ts";

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

export class MainAgentController {
	readonly #adapters: HostAdapterPort;
	readonly #sessions = new Map<string, PreparedSession>();

	private constructor(adapters: HostAdapterPort) {
		this.#adapters = adapters;
	}

	static create(adapters: HostAdapterPort): MainAgentController {
		return new MainAgentController(adapters);
	}

	#bind(
		workdir: Workdir,
		adapter: HostAdapter,
		pullRequest: CodeUnderReview,
		probes: readonly NamedProbe[],
	): PreparedSession {
		const specs = probes.map(({ name, probe }): CoordinatedProbeSpec => {
			if (probe.kind === "context") {
				return { name, kind: "context", probe };
			}
			return { name, kind: probe.kind, probe };
		});
		const { mainLedger } = coordinateLedgers(
			workdir.ledgerDirectory(),
			pullRequest,
			specs,
		);
		const session: PreparedSession = {
			adapter,
			pullRequest,
			probes,
			mainLedger,
		};
		this.#sessions.set(workdir.toString(), session);
		return session;
	}

	#sessionFor(workdir: Workdir): PreparedSession {
		const existing = this.#sessions.get(workdir.toString());
		if (!isNullOrEmpty(existing)) {
			const diskUpdated = existing.mainLedger
				.pending()
				.some(
					(name) => !isNullOrEmpty(workdir.ledgerDirectory().readSlice(name)),
				);
			if (diskUpdated) {
				return this.#bind(
					workdir,
					existing.adapter,
					existing.pullRequest,
					existing.probes,
				);
			}
			return existing;
		}
		const persisted = workdir.ledgerDirectory().readPullRequest();
		const { pullRequest, adapter } = this.#adapters.rehydrate(persisted);
		const rulesets = workdir.ledgerDirectory().readRulesets();
		const probes = loadPersistedProbes(
			workdir.readAudits(),
			persisted.surface,
			rulesets,
		);
		return this.#bind(workdir, adapter, pullRequest, probes);
	}

	async #prepareWith(
		workdir: Workdir,
		parsedAdapter: z.ZodSafeParseResult<HostAdapter>,
	): Promise<PrepareResult> {
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
		const { probes, rulesets } = await loadBundledProbes(
			resolved.change,
			surface,
			workdir.snapshotDirectory().toString(),
		);
		workdir.ledgerDirectory().writePullRequest({
			change: resolved.change,
			surface,
			fragments: [...resolved.snapshot.fragments()],
			threads: resolved.snapshot.threads(),
		});
		workdir.ledgerDirectory().writeRulesets(rulesets);
		for (const entry of probes) {
			workdir.writeAudit(entry.name, entry.auditDocument);
		}
		this.#bind(workdir, parsedAdapter.data, resolved.snapshot, probes);
		return { success: true, data: resolved };
	}

	prepare(url: string, workdir: Workdir): Promise<PrepareResult> {
		return this.#prepareWith(workdir, this.#adapters.from(url));
	}

	prepareWithToken(
		url: string,
		workdir: Workdir,
		token: AccessToken,
	): Promise<PrepareResult> {
		return this.#prepareWith(workdir, this.#adapters.fromWithToken(url, token));
	}

	ledger(workdir: Workdir): MainAgentLedger {
		return this.#sessionFor(workdir).mainLedger;
	}

	async dispatch(workdir: Workdir): Promise<DispatchResult> {
		const refreshed = this.#sessionFor(workdir);
		const submittedOutcome = refreshed.mainLedger.submittedOutcome();
		if (isNullOrEmpty(submittedOutcome)) {
			return {
				kind: "pending",
				remaining: [...refreshed.mainLedger.pending()],
			};
		}
		const submittedLedger = nonnull(refreshed.mainLedger.submittedLedger());
		const location = await refreshed.adapter.post(
			submittedOutcome,
			submittedLedger,
		);
		if (typeof location !== "string") {
			return location;
		}
		return {
			kind: "submitted",
			outcome: submittedOutcome,
			ledger: submittedLedger,
			location,
		};
	}

	dispatchWithToken(
		workdir: Workdir,
		token: AccessToken,
	): Promise<DispatchResult> {
		const persisted = workdir.ledgerDirectory().readPullRequest();
		const { pullRequest, adapter } = this.#adapters.rehydrateWithToken(
			persisted,
			token,
		);
		const rulesets = workdir.ledgerDirectory().readRulesets();
		const probes = loadPersistedProbes(
			workdir.readAudits(),
			persisted.surface,
			rulesets,
		);
		this.#bind(workdir, adapter, pullRequest, probes);
		return this.dispatch(workdir);
	}
}
