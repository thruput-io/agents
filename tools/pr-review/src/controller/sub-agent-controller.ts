import { z } from "zod";
import type { CodeUnderReview } from "../domain/code-under-review.ts";
import {
	type AckStatus,
	AckStatusSchema,
	type AckSuccess,
	type Change,
	type Checkout,
	type InstructionsSuccess,
	type PageResponse,
	type Row,
	type RulesetUrl,
	type RulesResponse,
} from "../domain/contracts.g.ts";
import type { HostAdapterPort } from "../domain/host-adapter.ts";
import { isNullOrEmpty } from "../domain/nullish.ts";
import type { WorkspaceFactoryPort, WorkspacePort } from "../domain/ports.ts";
import type { ProbeDocument } from "../domain/probe-document.ts";
import type {
	LedgerSubmission,
	SubAgentLedger,
} from "../domain/probe-ledger.ts";
import type { ProbeStorage } from "./probe-storage.ts";
import {
	customFailure,
	fromLedgerInit,
	loadWorkdirInit,
	type SubAgentControllerInit,
	withLedgerInit,
} from "./sub-agent-hydration.ts";
import { nextSurfacePage, prevSurfacePage } from "./sub-agent-paging.ts";
import {
	type ProbeBehavior,
	type ProbeRules,
	probeBehaviorFor,
} from "./sub-agent-probe.ts";

const UNACKNOWLEDGED_ERROR =
	"Probe must acknowledge instructions via ack before calling rules, next, prev, or report";

export interface AckResult {
	readonly success: true;
	readonly data: AckStatus;
	readonly response: AckSuccess;
}

export class SubAgentController {
	readonly #name: Checkout;
	readonly #workdir: WorkspacePort;
	readonly #ledger: SubAgentLedger;
	readonly #change: Change;
	readonly #behavior: ProbeBehavior;
	readonly #storage: ProbeStorage;
	readonly #now: () => number;

	private constructor(init: SubAgentControllerInit) {
		this.#name = init.name;
		this.#workdir = init.workdir;
		this.#ledger = init.ledger;
		this.#change = init.change;
		this.#behavior = init.behavior;
		this.#storage = init.storage;
		this.#now = init.now;
	}

	static from(
		workdir: WorkspacePort,
		ledger: SubAgentLedger,
		change: Change,
	): SubAgentController {
		return new SubAgentController(fromLedgerInit(workdir, ledger, change));
	}

	static forProbe(
		workdir: WorkspacePort,
		pullRequest: CodeUnderReview,
		probe: ProbeDocument,
	): SubAgentController {
		const behavior = probeBehaviorFor(
			probe,
			workdir.snapshotDirectory().toString(),
		);
		return SubAgentController.withLedger(
			workdir,
			behavior.toLedger(workdir.ledgerDirectory(), pullRequest),
			probe,
		);
	}

	static withLedger(
		workdir: WorkspacePort,
		ledger: SubAgentLedger,
		probe: ProbeDocument,
	): SubAgentController {
		return new SubAgentController(withLedgerInit(workdir, ledger, probe));
	}

	static forWorkdir(
		workdir: WorkspacePort,
		name: Checkout,
	): SubAgentController {
		return new SubAgentController(loadWorkdirInit(workdir, name, Date.now));
	}

	static forWorkdirWithClock(
		workdir: WorkspacePort,
		name: Checkout,
		now: () => number,
	): SubAgentController {
		return new SubAgentController(loadWorkdirInit(workdir, name, now));
	}

	static forSession(
		workspaceFactory: WorkspaceFactoryPort,
		sessionOrWorkdir: Checkout,
		name: Checkout,
	): SubAgentController {
		const parsed = workspaceFactory.fromSession(sessionOrWorkdir);
		if (!parsed.success) {
			throw new Error(z.prettifyError(parsed.error));
		}
		return SubAgentController.forWorkdir(parsed.data, name);
	}

	workdir(): WorkspacePort {
		return this.#workdir;
	}

	change(): Change {
		return this.#change;
	}

	codeUnderReview(): CodeUnderReview {
		return this.#ledger.pullRequest();
	}

	rules(): ProbeRules {
		return this.#behavior.rules;
	}

	instructions(): InstructionsSuccess {
		return this.#behavior.instructionsResponse(this.#name);
	}

	rulesResponse(url?: RulesetUrl, page?: number): RulesResponse {
		if (isNullOrEmpty(this.#storage.readAck())) {
			return { success: false, error: UNACKNOWLEDGED_ERROR };
		}
		return this.#behavior.rulesResponse(url, page);
	}

	next(): PageResponse {
		if (isNullOrEmpty(this.#storage.readAck())) {
			return { success: false, error: UNACKNOWLEDGED_ERROR };
		}
		return nextSurfacePage(
			this.codeUnderReview().surface(),
			this.#change,
			this.#storage,
		);
	}

	prev(): PageResponse {
		if (isNullOrEmpty(this.#storage.readAck())) {
			return { success: false, error: UNACKNOWLEDGED_ERROR };
		}
		return prevSurfacePage(
			this.codeUnderReview().surface(),
			this.#change,
			this.#storage,
		);
	}

	ack(): AckResult {
		const acknowledgedAt = this.#now();
		this.#storage.writeAck(acknowledgedAt);
		const response = this.#behavior.ackResponse(this.#name);
		return {
			success: true,
			data: AckStatusSchema.parse({
				acknowledgedAt,
				deadlineMs: response.deadlineMs,
				permissions: response.permissions,
			}),
			response,
		};
	}

	report(rows: readonly Row[]): z.ZodSafeParseResult<LedgerSubmission> {
		if (isNullOrEmpty(this.#storage.readAck())) {
			return customFailure("ack", UNACKNOWLEDGED_ERROR);
		}
		return this.#ledger.report(rows);
	}

	async submitReport(
		rows: readonly Row[],
		adapters: HostAdapterPort,
	): Promise<z.ZodSafeParseResult<LedgerSubmission>> {
		const reported = this.report(rows);
		if (!reported.success || reported.data.kind === "recorded") {
			return reported;
		}
		const existing = this.#workdir.ledgerDirectory().readSubmission();
		if (existing !== null) {
			return {
				success: true,
				data: {
					...reported.data,
					location: existing.location,
				},
			};
		}
		const persisted = this.#workdir.ledgerDirectory().readPullRequest();
		const { adapter } = adapters.rehydrate(persisted);
		const location = await adapter.post(
			reported.data.outcome,
			reported.data.ledger,
		);
		if (typeof location !== "string") {
			return customFailure("host", `${location.message}: ${location.reason}`);
		}
		this.#workdir.ledgerDirectory().writeSubmission({
			outcome: reported.data.outcome,
			location,
		});
		return {
			success: true,
			data: {
				...reported.data,
				location,
			},
		};
	}
}
