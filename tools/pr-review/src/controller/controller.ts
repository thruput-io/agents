import { setTimeout as sleepMs } from "node:timers/promises";
import type { AccessToken } from "../domain/access-token.ts";
import {
	type ReviewStatus,
	StatusCommandSchema,
} from "../domain/contracts.g.ts";
import type { HostAdapterPort } from "../domain/host-adapter.ts";
import type { MainAgentLedger } from "../domain/main-agent-ledger.ts";
import type {
	ClockPort,
	ProbeCatalogPort,
	WorkspacePort,
} from "../domain/ports.ts";
import {
	type PreparedSession,
	type PrepareResult,
	prepareWithAdapter,
	sessionForWorkdir,
} from "./controller-session.ts";

const DEFAULT_CLOCK: ClockPort = {
	now: Date.now,
	sleep: async (ms: number) => {
		await sleepMs(ms);
	},
};

const toReviewStatus = (ledger: MainAgentLedger): ReviewStatus => ({
	pending: [...ledger.pending()],
	acknowledged: [...ledger.acknowledged()],
	unacknowledged: [...ledger.unacknowledged()],
	completed: [...ledger.completed()],
	submittedOutcome: ledger.submittedOutcome(),
	location: ledger.submittedLocation(),
});

const pollAckStep = async (options: {
	readonly ledger: MainAgentLedger;
	readonly startMs: number;
	readonly ackTimeoutMs: number;
	readonly pollIntervalMs: number;
	readonly clock: ClockPort;
}): Promise<void> => {
	const { ledger, startMs, ackTimeoutMs, pollIntervalMs, clock } = options;
	const elapsedMs = clock.now() - startMs;
	if (
		ledger.pending().length === 0 ||
		ledger.unacknowledged().length === 0 ||
		elapsedMs >= ackTimeoutMs
	) {
		return;
	}
	await clock.sleep(Math.min(pollIntervalMs, ackTimeoutMs - elapsedMs));
	await pollAckStep(options);
};

const waitForAckPhase = (options: {
	readonly ledger: MainAgentLedger;
	readonly ackTimeoutMs: number;
	readonly pollIntervalMs: number;
	readonly clock: ClockPort;
}): Promise<void> => pollAckStep({ ...options, startMs: options.clock.now() });

const waitForDeadlinePhase = async (options: {
	readonly ledger: MainAgentLedger;
	readonly pollIntervalMs: number;
	readonly clock: ClockPort;
}): Promise<void> => {
	const { ledger, pollIntervalMs, clock } = options;
	if (ledger.pending().length === 0 || ledger.unacknowledged().length > 0) {
		return;
	}
	const remainingMs = ledger.nextDeadlineMs();
	if (remainingMs === null || remainingMs <= 0) {
		return;
	}
	await clock.sleep(Math.min(pollIntervalMs, remainingMs));
	await waitForDeadlinePhase(options);
};

const pollHostSubmissionStep = async (options: {
	readonly ledger: MainAgentLedger;
	readonly startMs: number;
	readonly ackTimeoutMs: number;
	readonly pollIntervalMs: number;
	readonly clock: ClockPort;
}): Promise<void> => {
	const { ledger, startMs, ackTimeoutMs, pollIntervalMs, clock } = options;
	const elapsedMs = clock.now() - startMs;
	if (
		ledger.pending().length > 0 ||
		ledger.submittedOutcome() === null ||
		ledger.submittedLocation() !== null ||
		elapsedMs >= ackTimeoutMs
	) {
		return;
	}
	await clock.sleep(Math.min(pollIntervalMs, ackTimeoutMs - elapsedMs));
	await pollHostSubmissionStep(options);
};

const waitForHostSubmission = (options: {
	readonly ledger: MainAgentLedger;
	readonly ackTimeoutMs: number;
	readonly pollIntervalMs: number;
	readonly clock: ClockPort;
}): Promise<void> =>
	pollHostSubmissionStep({ ...options, startMs: options.clock.now() });

export class MainAgentController {
	readonly #adapters: HostAdapterPort;
	readonly #loadProbes: ProbeCatalogPort;
	readonly #clock: ClockPort;
	readonly #sessions = new Map<string, PreparedSession>();

	private constructor(
		adapters: HostAdapterPort,
		loadProbes: ProbeCatalogPort,
		clock: ClockPort,
	) {
		this.#adapters = adapters;
		this.#loadProbes = loadProbes;
		this.#clock = clock;
	}

	static create(
		adapters: HostAdapterPort,
		loadProbes: ProbeCatalogPort,
	): MainAgentController {
		return new MainAgentController(adapters, loadProbes, DEFAULT_CLOCK);
	}

	static createWithClock(
		adapters: HostAdapterPort,
		loadProbes: ProbeCatalogPort,
		clock: ClockPort,
	): MainAgentController {
		return new MainAgentController(adapters, loadProbes, clock);
	}

	prepare(url: string, workdir: WorkspacePort): Promise<PrepareResult> {
		return prepareWithAdapter({
			workdir,
			parsedAdapter: this.#adapters.from(url),
			loadProbes: this.#loadProbes,
			sessions: this.#sessions,
			rawToken: null,
			now: this.#clock.now,
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
			now: this.#clock.now,
		});
	}

	ledger(workdir: WorkspacePort): MainAgentLedger {
		return sessionForWorkdir({
			workdir,
			adapters: this.#adapters,
			sessions: this.#sessions,
			now: this.#clock.now,
		}).mainLedger;
	}

	async status(workdir: WorkspacePort): Promise<ReviewStatus> {
		const { ackTimeoutMs, pollIntervalMs } = StatusCommandSchema.parse({
			command: "status",
			workdir: workdir.toString(),
		});
		const ledger = this.ledger(workdir);
		await waitForAckPhase({
			ledger,
			ackTimeoutMs,
			pollIntervalMs,
			clock: this.#clock,
		});
		if (ledger.pending().length > 0 && ledger.unacknowledged().length === 0) {
			await waitForDeadlinePhase({
				ledger,
				pollIntervalMs,
				clock: this.#clock,
			});
		}
		await waitForHostSubmission({
			ledger,
			ackTimeoutMs,
			pollIntervalMs,
			clock: this.#clock,
		});
		return toReviewStatus(ledger);
	}
}
