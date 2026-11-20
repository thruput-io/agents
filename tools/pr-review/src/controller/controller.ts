import type { AccessToken } from "../domain/access-token.ts";
import type { DispatchResult } from "../domain/contracts.g.ts";
import type { HostAdapterPort } from "../domain/host-adapter.ts";
import type { MainAgentLedger } from "../domain/main-agent-ledger.ts";
import { isNullOrEmpty, nonnull } from "../domain/nullish.ts";
import type { ProbeCatalogPort, WorkspacePort } from "../domain/ports.ts";
import {
	type PreparedSession,
	type PrepareResult,
	prepareWithAdapter,
	rehydrateSession,
	sessionForWorkdir,
} from "./controller-session.ts";

export class MainAgentController {
	readonly #adapters: HostAdapterPort;
	readonly #loadProbes: ProbeCatalogPort;
	readonly #sessions = new Map<string, PreparedSession>();

	private constructor(adapters: HostAdapterPort, loadProbes: ProbeCatalogPort) {
		this.#adapters = adapters;
		this.#loadProbes = loadProbes;
	}

	static create(
		adapters: HostAdapterPort,
		loadProbes: ProbeCatalogPort,
	): MainAgentController {
		return new MainAgentController(adapters, loadProbes);
	}

	prepare(url: string, workdir: WorkspacePort): Promise<PrepareResult> {
		return prepareWithAdapter(
			workdir,
			this.#adapters.from(url),
			this.#loadProbes,
			this.#sessions,
		);
	}

	prepareWithToken(
		url: string,
		workdir: WorkspacePort,
		token: AccessToken,
	): Promise<PrepareResult> {
		return prepareWithAdapter(
			workdir,
			this.#adapters.fromWithToken(url, token),
			this.#loadProbes,
			this.#sessions,
		);
	}

	ledger(workdir: WorkspacePort): MainAgentLedger {
		return sessionForWorkdir(workdir, this.#adapters, this.#sessions)
			.mainLedger;
	}

	async dispatch(workdir: WorkspacePort): Promise<DispatchResult> {
		const refreshed = sessionForWorkdir(
			workdir,
			this.#adapters,
			this.#sessions,
		);
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
		workdir: WorkspacePort,
		token: AccessToken,
	): Promise<DispatchResult> {
		rehydrateSession(
			workdir,
			(persisted) => this.#adapters.rehydrateWithToken(persisted, token),
			this.#sessions,
		);
		return this.dispatch(workdir);
	}
}
