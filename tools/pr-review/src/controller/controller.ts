import type { AccessToken } from "../domain/access-token.ts";
import type { HostAdapterPort } from "../domain/host-adapter.ts";
import type { MainAgentLedger } from "../domain/main-agent-ledger.ts";
import type { ProbeCatalogPort, WorkspacePort } from "../domain/ports.ts";
import {
	type PreparedSession,
	type PrepareResult,
	prepareWithAdapter,
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
		return prepareWithAdapter({
			workdir,
			parsedAdapter: this.#adapters.from(url),
			loadProbes: this.#loadProbes,
			sessions: this.#sessions,
			rawToken: null,
		});
	}

	prepareWithToken(
		url: string,
		workdir: WorkspacePort,
		token: AccessToken,
	): Promise<PrepareResult> {
		return prepareWithAdapter({
			workdir,
			parsedAdapter: this.#adapters.fromWithToken(url, token),
			loadProbes: this.#loadProbes,
			sessions: this.#sessions,
			rawToken: token.toString(),
		});
	}

	ledger(workdir: WorkspacePort): MainAgentLedger {
		return sessionForWorkdir(workdir, this.#adapters, this.#sessions)
			.mainLedger;
	}
}
