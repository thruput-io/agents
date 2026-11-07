import type { z } from "zod";
import type { AccessToken } from "./access-token.ts";
import type { AdapterResolution, HostAdapter } from "./adapter.ts";
import { HostAdapterFactory } from "./adapter-factory.ts";
import type { CodeUnderReview } from "./code-under-review.ts";
import type { Ledger, Outcome } from "./contracts.g.ts";
import {
	type CoordinatedProbeSpec,
	coordinateLedgers,
	type MainAgentLedger,
} from "./main-agent-ledger.ts";
import { isNullOrEmpty, nonnull } from "./nullish.ts";
import { loadBundledProbes, type NamedProbe } from "./probe-loader.ts";
import { SubAgentController } from "./sub-agent-controller.ts";
import type { Workdir } from "./workdir.ts";

export type ProbeRunner = (
	name: string,
	controller: SubAgentController,
) => Promise<void> | void;

export type ReadyReview = Extract<
	AdapterResolution,
	{ readonly kind: "ready" }
>;

export type PrepareError =
	| { readonly kind: "invalid-target"; readonly error: z.ZodError }
	| Exclude<AdapterResolution, { readonly kind: "ready" }>;

export type PrepareResult =
	| { readonly success: true; readonly data: ReadyReview }
	| { readonly success: false; readonly error: PrepareError };

export type DispatchResult =
	| { readonly kind: "pending"; readonly remaining: readonly string[] }
	| {
			readonly kind: "submitted";
			readonly outcome: Outcome;
			readonly ledger: Ledger;
			readonly location: string;
	  };

interface PreparedSession {
	readonly adapter: HostAdapter;
	readonly mainLedger: MainAgentLedger;
	readonly controllers: ReadonlyMap<string, SubAgentController>;
}

const noopRunner: ProbeRunner = () => undefined;

export class MainAgentController {
	readonly #runner: ProbeRunner;
	readonly #sessions = new Map<string, PreparedSession>();

	private constructor(runner: ProbeRunner) {
		this.#runner = runner;
	}

	static create(): MainAgentController {
		return new MainAgentController(noopRunner);
	}

	static withRunner(runner: ProbeRunner): MainAgentController {
		return new MainAgentController(runner);
	}

	#bind(
		workdir: Workdir,
		adapter: HostAdapter,
		pullRequest: CodeUnderReview,
		probes: readonly NamedProbe[],
	): void {
		const specs = probes.map(({ name, probe }): CoordinatedProbeSpec => {
			if (probe.kind === "context") {
				return { name, kind: "context", probe };
			}
			return { name, kind: probe.kind, probe };
		});
		const { ledgers, mainLedger } = coordinateLedgers(
			workdir.ledgerDirectory(),
			pullRequest,
			specs,
		);
		const controllers = new Map<string, SubAgentController>();
		for (const [index, entry] of probes.entries()) {
			workdir.writeAudit(entry.name, entry.auditDocument);
			const baseLedger = nonnull(ledgers[index]);
			controllers.set(
				entry.name,
				SubAgentController.withLedger(workdir, baseLedger, entry.probe),
			);
		}
		this.#sessions.set(workdir.toString(), {
			adapter,
			mainLedger,
			controllers,
		});
	}

	async #prepareWith(
		workdir: Workdir,
		parsedAdapter: z.ZodSafeParseResult<HostAdapter>,
	): Promise<PrepareResult> {
		if (!parsedAdapter.success) {
			return {
				success: false,
				error: { kind: "invalid-target", error: parsedAdapter.error },
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
		const probes = await loadBundledProbes(
			resolved.change,
			surface,
			workdir.snapshotDirectory().toString(),
		);
		this.#bind(workdir, parsedAdapter.data, resolved.snapshot, probes);
		return { success: true, data: resolved };
	}

	prepare(url: string, workdir: Workdir): Promise<PrepareResult> {
		return this.#prepareWith(workdir, HostAdapterFactory.from(url));
	}

	prepareWithToken(
		url: string,
		workdir: Workdir,
		token: AccessToken,
	): Promise<PrepareResult> {
		return this.#prepareWith(
			workdir,
			HostAdapterFactory.fromWithToken(url, token),
		);
	}

	ledger(workdir: Workdir): MainAgentLedger {
		return nonnull(this.#sessions.get(workdir.toString())).mainLedger;
	}

	async dispatch(workdir: Workdir): Promise<DispatchResult> {
		const session = nonnull(this.#sessions.get(workdir.toString()));
		for (const name of session.mainLedger.pending()) {
			await this.#runner(name, nonnull(session.controllers.get(name)));
		}
		const submittedOutcome = session.mainLedger.submittedOutcome();
		if (isNullOrEmpty(submittedOutcome)) {
			return {
				kind: "pending",
				remaining: session.mainLedger.pending(),
			};
		}
		const submittedLedger = nonnull(session.mainLedger.submittedLedger());
		const location = await session.adapter.post(
			submittedOutcome,
			submittedLedger,
		);
		return {
			kind: "submitted",
			outcome: submittedOutcome,
			ledger: submittedLedger,
			location,
		};
	}
}
