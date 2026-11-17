import { z } from "zod";
import { HostAdapterFactory } from "./adapter-factory.ts";
import type { CodeUnderReview } from "./code-under-review.ts";
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
	type Surface,
} from "./contracts.g.ts";
import { Instructions } from "./instructions.ts";
import { coordinateLedgers } from "./main-agent-ledger.ts";
import { isNullOrEmpty, nonnull } from "./nullish.ts";
import { paginateSurface } from "./pagination.ts";
import type { LedgerSubmission, SubAgentLedger } from "./probe-ledger.ts";
import { loadPersistedProbes, toAgentInstructions } from "./probe-loader.ts";
import {
	inMemoryProbeStorage,
	type ProbeBehavior,
	type ProbeDocument,
	type ProbeRules,
	type ProbeStorage,
	persistedProbeStorage,
	probeBehaviorFor,
} from "./sub-agent-probe.ts";
import { Workdir } from "./workdir.ts";

const SHA1_HEX_LENGTH = 40;
const ZERO_COMMIT_SHA = "0".repeat(SHA1_HEX_LENGTH);

interface SubAgentControllerInit {
	readonly workdir: Workdir;
	readonly ledger: SubAgentLedger;
	readonly instructions: Instructions;
	readonly change: Change;
	readonly behavior: ProbeBehavior;
	readonly storage: ProbeStorage;
	readonly now: () => number;
}

const customFailure = (
	path: string,
	message: string,
): z.ZodSafeParseResult<LedgerSubmission> =>
	z
		.custom<LedgerSubmission>(() => false, { path: [path], message })
		.safeDecode(null as never);

export type { ProbeDocument } from "./sub-agent-probe.ts";

export type AckResult =
	| { readonly success: true; readonly data: AckStatus }
	| { readonly success: false; readonly error: string };

export const SUBAGENT_DEADLINE_MS = DeadlineMsSchema.decode(undefined);

export class SubAgentController {
	readonly #workdir: Workdir;
	readonly #ledger: SubAgentLedger;
	readonly #instructions: Instructions;
	readonly #change: Change;
	readonly #behavior: ProbeBehavior;
	readonly #storage: ProbeStorage;
	readonly #now: () => number;
	#acknowledgedAt: number | null = null;
	#cursor: number | null = null;

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
		workdir: Workdir,
		ledger: SubAgentLedger,
		change: Change,
	): SubAgentController {
		const checkout = workdir.snapshotDirectory().toString();
		const surface: Surface = {
			headCommit: ZERO_COMMIT_SHA,
			files: [...ledger.pullRequest().surface()],
		};
		const behavior = probeBehaviorFor(
			{ kind: "context", change, surface, rulesets: [], checkout },
			checkout,
		);
		return new SubAgentController({
			workdir,
			ledger,
			instructions: Instructions.forKind("context"),
			change,
			behavior,
			storage: inMemoryProbeStorage(),
			now: Date.now,
		});
	}

	static forProbe(
		workdir: Workdir,
		pullRequest: CodeUnderReview,
		probe: ProbeDocument,
	): SubAgentController {
		const behavior = probeBehaviorFor(
			probe,
			workdir.snapshotDirectory().toString(),
		);
		const ledger = behavior.toLedger(workdir.ledgerDirectory(), pullRequest);
		return SubAgentController.withLedger(workdir, ledger, probe);
	}

	static withLedger(
		workdir: Workdir,
		ledger: SubAgentLedger,
		probe: ProbeDocument,
	): SubAgentController {
		const behavior = probeBehaviorFor(
			probe,
			workdir.snapshotDirectory().toString(),
		);
		return new SubAgentController({
			workdir,
			ledger,
			instructions: Instructions.forKind(probe.kind),
			change: probe.change,
			behavior,
			storage: inMemoryProbeStorage(),
			now: Date.now,
		});
	}

	static forWorkdir(
		workdir: Workdir,
		name: Checkout,
		now: () => number = Date.now,
	): SubAgentController {
		const persisted = workdir.ledgerDirectory().readPullRequest();
		const { pullRequest } = HostAdapterFactory.rehydrate(persisted);
		const rulesets = workdir.ledgerDirectory().readRulesets();
		const probes = loadPersistedProbes(
			workdir.readAudits(),
			persisted.surface,
			rulesets,
		);
		const checkoutDir = workdir.snapshotDirectory().toString();
		const specs = probes.map((entry) =>
			probeBehaviorFor(entry.probe, checkoutDir).toCoordinatedSpec(entry.name),
		);
		const { ledgers } = coordinateLedgers(
			workdir.ledgerDirectory(),
			pullRequest,
			specs,
		);
		const index = probes.findIndex((entry) => entry.name === name);
		if (index < 0) {
			throw new Error(`Unknown probe: ${name}`);
		}
		const target = nonnull(probes[index]);
		const behavior = probeBehaviorFor(target.probe, checkoutDir);
		return new SubAgentController({
			workdir,
			ledger: nonnull(ledgers[index]),
			instructions: Instructions.forKind(target.probe.kind),
			change: target.probe.change,
			behavior,
			storage: persistedProbeStorage(workdir.ledgerDirectory(), name),
			now,
		});
	}

	static forSession(
		sessionOrWorkdir: Checkout,
		name: Checkout,
		now: () => number = Date.now,
	): SubAgentController {
		const parsed = Workdir.fromSession(sessionOrWorkdir);
		if (!parsed.success) {
			throw new Error(z.prettifyError(parsed.error));
		}
		return SubAgentController.forWorkdir(parsed.data, name, now);
	}

	workdir(): Workdir {
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

	#readCursor(): number {
		return this.#cursor ?? this.#storage.readCursor() ?? -1;
	}

	#writeCursor(index: number): void {
		this.#cursor = index;
		this.#storage.writeCursor(index);
	}

	next(): PageResponse {
		const pages = paginateSurface(this.#behavior.probe.surface.files);
		const totalFiles = this.#behavior.probe.surface.files.length;
		const totalPages = pages.length;
		if (totalPages === 0) {
			return { success: true, status: "end", totalFiles: 0, totalPages: 0 };
		}
		const target = this.#readCursor() + 1;
		if (target >= totalPages) {
			this.#writeCursor(totalPages);
			return { success: true, status: "end", totalFiles, totalPages };
		}
		this.#writeCursor(target);
		return nonnull(pages[target]);
	}

	prev(): PageResponse {
		const pages = paginateSurface(this.#behavior.probe.surface.files);
		const totalFiles = this.#behavior.probe.surface.files.length;
		const totalPages = pages.length;
		if (totalPages === 0) {
			return { success: true, status: "start", totalFiles: 0, totalPages: 0 };
		}
		const target = this.#readCursor() - 1;
		if (target < 0) {
			this.#writeCursor(-1);
			return { success: true, status: "start", totalFiles, totalPages };
		}
		this.#writeCursor(target);
		return nonnull(pages[target]);
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
		this.#acknowledgedAt = acknowledgedAt;
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
		const ackTime = this.#acknowledgedAt ?? this.#storage.readAck();
		if (isNullOrEmpty(ackTime)) {
			return customFailure(
				"ack",
				"Probe must acknowledge instructions via ack before reporting",
			);
		}
		return this.#ledger.report(rows);
	}
}
