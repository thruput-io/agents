import { z } from "zod";
import type { CodeUnderReview } from "../domain/code-under-review.ts";
import {
	type AckPayload,
	type AckStatus,
	type AgentInstructions,
	type Change,
	type Checkout,
	DeadlineMsSchema,
	type PageResponse,
	type Row,
	type RulesetPageResponse,
	type RulesetUrl,
} from "../domain/contracts.g.ts";
import type { Instructions } from "../domain/instructions.ts";
import { isNullOrEmpty } from "../domain/nullish.ts";
import type { WorkspaceFactoryPort, WorkspacePort } from "../domain/ports.ts";
import {
	type ProbeDocument,
	toAgentInstructions,
} from "../domain/probe-document.ts";
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

export type AckResult =
	| { readonly success: true; readonly data: AckStatus }
	| { readonly success: false; readonly error: string };

export const SUBAGENT_DEADLINE_MS = DeadlineMsSchema.decode(undefined);

export class SubAgentController {
	readonly #workdir: WorkspacePort;
	readonly #ledger: SubAgentLedger;
	readonly #instructions: Instructions;
	readonly #change: Change;
	readonly #behavior: ProbeBehavior;
	readonly #storage: ProbeStorage;
	readonly #now: () => number;

	private constructor(init: SubAgentControllerInit) {
		this.#workdir = init.workdir;
		this.#ledger = init.ledger;
		this.#instructions = init.instructions;
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

	instructions(): Instructions {
		return this.#instructions;
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

	inspect(): AgentInstructions {
		return toAgentInstructions(this.#behavior.probe);
	}

	next(): PageResponse {
		return nextSurfacePage(this.#behavior.probe.surface.files, this.#storage);
	}

	prev(): PageResponse {
		return prevSurfacePage(this.#behavior.probe.surface.files, this.#storage);
	}

	ruleset(url: RulesetUrl, page: number): RulesetPageResponse {
		return this.#behavior.ruleset(url, page);
	}

	ack(payload: AckPayload): AckResult {
		const check = this.#behavior.validateAck(payload);
		if (!check.success) {
			return check;
		}
		const acknowledgedAt = this.#now();
		this.#storage.writeAck(acknowledgedAt);
		return {
			success: true,
			data: {
				acknowledgedAt,
				deadlineMs: SUBAGENT_DEADLINE_MS,
				permissions: this.#instructions.permissions(),
			},
		};
	}

	report(rows: readonly Row[]): z.ZodSafeParseResult<LedgerSubmission> {
		const ackTime = this.#storage.readAck();
		if (isNullOrEmpty(ackTime)) {
			return customFailure(
				"ack",
				"Probe must acknowledge instructions via ack before reporting",
			);
		}
		return this.#ledger.report(rows);
	}
}
