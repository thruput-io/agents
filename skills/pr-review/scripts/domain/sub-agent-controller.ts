import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { HostAdapterFactory } from "./adapter-factory.ts";
import type { CodeUnderReview } from "./code-under-review.ts";
import type {
	AckPayload,
	AgentInstructions,
	Change,
	Checkout,
	ContextKind,
	ContextPermissions,
	ContextTask,
	DeadCodeKind,
	DeadCodePermissions,
	DeadCodeTask,
	Rulebook as ExternalRulebook,
	InstructionsProse,
	PageResponse,
	ReuseKind,
	ReusePermissions,
	ReuseTask,
	Row,
	RulesetPageResponse,
	RulesetUrl,
	RulesKind,
	RulesPermissions,
	RulesTask,
	Surface,
} from "./contracts.g.ts";
import { Instructions } from "./instructions.ts";
import {
	type CoordinatedProbeSpec,
	coordinateLedgers,
} from "./main-agent-ledger.ts";
import { isNullOrEmpty, nonnull } from "./nullish.ts";
import { paginateSurface, paginateText } from "./pagination.ts";
import { loadPersistedProbes, toAgentInstructions } from "./probe-loader.ts";
import type { Rulebook } from "./rulebook.ts";
import {
	type AckResult,
	runSubAgentCli,
	SUBAGENT_DEADLINE_MS,
} from "./sub-agent-cli.ts";
import {
	ContextSubAgentLedger,
	DeadCodeSubAgentLedger,
	type LedgerSubmission,
	ReuseSubAgentLedger,
	RulesSubAgentLedger,
	type SubAgentLedger,
} from "./sub-agent-ledger.ts";
import { Workdir } from "./workdir.ts";

export const isCliEntrypoint = (metaUrl: string): boolean => {
	const entryArg = process.argv[1];
	if (isNullOrEmpty(entryArg)) {
		return false;
	}
	try {
		return realpathSync(fileURLToPath(metaUrl)) === realpathSync(entryArg);
	} catch {
		return false;
	}
};

export type ProbeDocument =
	| {
			readonly instructions?: InstructionsProse;
			readonly task?: RulesTask | ReuseTask | DeadCodeTask;
			readonly permissions?:
				| RulesPermissions
				| ReusePermissions
				| DeadCodePermissions;
			readonly kind: RulesKind | ReuseKind | DeadCodeKind;
			readonly change: Change;
			readonly surface: Surface;
			readonly rulebook: Rulebook;
			readonly checkout?: Checkout;
	  }
	| {
			readonly instructions?: InstructionsProse;
			readonly task?: ContextTask;
			readonly permissions?: ContextPermissions;
			readonly kind: ContextKind;
			readonly change: Change;
			readonly surface: Surface;
			readonly rulesets: readonly ExternalRulebook[];
			readonly checkout?: Checkout;
	  };

export type ProbeRules =
	| { readonly kind: "rulebook"; readonly rulebook: Rulebook }
	| {
			readonly kind: "rulesets";
			readonly rulesets: readonly ExternalRulebook[];
	  };

const rulesProbeLedgers = {
	rules: RulesSubAgentLedger.from,
	"dead-code": DeadCodeSubAgentLedger.from,
	reuse: ReuseSubAgentLedger.from,
} as const;

interface SubAgentControllerInit {
	readonly workdir: Workdir;
	readonly ledger: SubAgentLedger;
	readonly instructions: Instructions;
	readonly change: Change;
	readonly rules: ProbeRules;
	readonly probe: ProbeDocument;
	readonly name?: string | undefined;
	readonly now?: (() => number) | undefined;
}

const customFailure = (
	path: string,
	message: string,
): z.ZodSafeParseResult<LedgerSubmission> =>
	z
		.custom<LedgerSubmission>(() => false, { path: [path], message })
		.safeDecode(null as never);

export class SubAgentController {
	readonly #workdir: Workdir;
	readonly #ledger: SubAgentLedger;
	readonly #instructions: Instructions;
	readonly #change: Change;
	readonly #rules: ProbeRules;
	readonly #probe: ProbeDocument;
	readonly #name: string | undefined;
	readonly #now: () => number;
	#acknowledgedAt: number | null = null;
	#cursor: number | null = null;

	private constructor(init: SubAgentControllerInit) {
		this.#workdir = init.workdir;
		this.#ledger = init.ledger;
		this.#instructions = init.instructions;
		this.#change = init.change;
		this.#rules = init.rules;
		this.#probe = init.probe;
		this.#name = init.name;
		this.#now = init.now ?? Date.now;
	}

	static from(
		workdir: Workdir,
		ledger: SubAgentLedger,
		change: Change,
	): SubAgentController {
		const surface: Surface = {
			headCommit: "0".repeat(40),
			files: [...ledger.pullRequest().surface()],
		};
		return new SubAgentController({
			workdir,
			ledger,
			instructions: Instructions.forKind("context"),
			change,
			rules: { kind: "rulesets", rulesets: [] },
			probe: {
				kind: "context",
				change,
				surface,
				rulesets: [],
				checkout: workdir.snapshotDirectory().toString(),
			},
		});
	}

	static forProbe(
		workdir: Workdir,
		pullRequest: CodeUnderReview,
		probe: ProbeDocument,
	): SubAgentController {
		const directory = workdir.ledgerDirectory();
		const ledger: SubAgentLedger =
			probe.kind === "context"
				? ContextSubAgentLedger.from(directory, pullRequest, probe)
				: rulesProbeLedgers[probe.kind](directory, pullRequest, probe);
		return SubAgentController.withLedger(workdir, ledger, probe);
	}

	static withLedger(
		workdir: Workdir,
		ledger: SubAgentLedger,
		probe: ProbeDocument,
		options?: { readonly name?: string; readonly now?: () => number },
	): SubAgentController {
		const rules: ProbeRules =
			probe.kind === "context"
				? { kind: "rulesets", rulesets: probe.rulesets }
				: { kind: "rulebook", rulebook: probe.rulebook };
		const hydratedProbe: ProbeDocument =
			probe.kind === "rules"
				? probe
				: {
						...probe,
						checkout: probe.checkout ?? workdir.snapshotDirectory().toString(),
					};
		return new SubAgentController({
			workdir,
			ledger,
			instructions: Instructions.forKind(probe.kind),
			change: probe.change,
			rules,
			probe: hydratedProbe,
			name: options?.name,
			now: options?.now,
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
		const specs = probes.map((entry): CoordinatedProbeSpec => {
			if (entry.probe.kind === "context") {
				return { name: entry.name, kind: "context", probe: entry.probe };
			}
			return {
				name: entry.name,
				kind: entry.probe.kind,
				probe: entry.probe,
			};
		});
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
		return SubAgentController.withLedger(
			workdir,
			nonnull(ledgers[index]),
			target.probe,
			{ name, now },
		);
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
		return this.#rules;
	}

	inspect(): AgentInstructions {
		return toAgentInstructions(this.#probe);
	}

	#readCursor(): number | null {
		return (
			this.#cursor ??
			(isNullOrEmpty(this.#name)
				? null
				: this.#workdir.ledgerDirectory().readCursor(this.#name))
		);
	}

	#writeCursor(index: number): void {
		this.#cursor = index;
		if (!isNullOrEmpty(this.#name)) {
			this.#workdir.ledgerDirectory().writeCursor(this.#name, index);
		}
	}

	next(): PageResponse {
		const pages = paginateSurface(this.#probe.surface.files);
		const totalFiles = this.#probe.surface.files.length;
		const totalPages = pages.length;
		if (totalPages === 0) {
			return { success: true, status: "end", totalFiles: 0, totalPages: 0 };
		}
		const current = this.#readCursor();
		const target = current === null ? 0 : current + 1;
		if (target >= totalPages) {
			this.#writeCursor(totalPages);
			return { success: true, status: "end", totalFiles, totalPages };
		}
		this.#writeCursor(target);
		return nonnull(pages[target]);
	}

	prev(): PageResponse {
		const pages = paginateSurface(this.#probe.surface.files);
		const totalFiles = this.#probe.surface.files.length;
		const totalPages = pages.length;
		if (totalPages === 0) {
			return { success: true, status: "start", totalFiles: 0, totalPages: 0 };
		}
		const current = this.#readCursor();
		const target = current === null ? -1 : current - 1;
		if (target < 0) {
			this.#writeCursor(-1);
			return { success: true, status: "start", totalFiles, totalPages };
		}
		this.#writeCursor(target);
		return nonnull(pages[target]);
	}

	ruleset(url: RulesetUrl, page: number): RulesetPageResponse {
		if (this.#probe.kind !== "context") {
			return {
				success: false,
				error: `Probe kind ${this.#probe.kind} has no external rulesets; only context probes use the ruleset command.`,
			};
		}
		const book = this.#probe.rulesets.find((entry) => entry.url === url);
		if (isNullOrEmpty(book)) {
			return {
				success: false,
				error: `Unknown ruleset URL: ${url}. Choose one of the URLs returned in inspect under #/rulesets.`,
			};
		}
		const chunks = paginateText(book.text);
		if (page < 1 || page > chunks.length) {
			return {
				success: false,
				error: `Ruleset page ${page} is out of range for ${url} (valid pages: 1..${chunks.length}).`,
			};
		}
		return {
			success: true,
			url: book.url,
			title: book.title,
			page,
			totalPages: chunks.length,
			text: nonnull(chunks[page - 1]),
		};
	}

	ack(payload: AckPayload): AckResult {
		if (this.#probe.kind === "context") {
			if (!("bookRuleRows" in payload) || payload.bookRuleRows !== 3) {
				return {
					success: false,
					error:
						'Invalid ack payload for context probe. Expected JSON: {"message":"<dispatcher message received>","bookRuleRows":3,"observationFormat":"<observation> breaks <principle>"} because context probes report 3 bookRule rows whose observations complete "<observation> breaks <principle>".',
				};
			}
		} else {
			const expected = this.#probe.rulebook.rules.map((rule) => rule.id);
			if (!("rulesInOrder" in payload)) {
				return {
					success: false,
					error: `Invalid ack payload for ${this.#probe.kind} probe. Expected JSON with "rulesInOrder": ${JSON.stringify(expected)} and "observationFormat": "<observation> breaks <principle>".`,
				};
			}
			if (JSON.stringify(payload.rulesInOrder) !== JSON.stringify(expected)) {
				return {
					success: false,
					error: `Ack "rulesInOrder" must match #/ruleset/rules in exact order before probing. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(payload.rulesInOrder)}. Also include "observationFormat": "<observation> breaks <principle>".`,
				};
			}
		}
		const acknowledgedAt = this.#now();
		this.#acknowledgedAt = acknowledgedAt;
		if (!isNullOrEmpty(this.#name)) {
			this.#workdir.ledgerDirectory().writeAck(this.#name, acknowledgedAt);
		}
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
		const ackTime =
			this.#acknowledgedAt ??
			(isNullOrEmpty(this.#name)
				? null
				: this.#workdir.ledgerDirectory().readAck(this.#name));
		if (isNullOrEmpty(ackTime)) {
			return customFailure(
				"ack",
				"Probe must acknowledge instructions via ack before reporting",
			);
		}
		return this.#ledger.report(rows);
	}
}

if (import.meta.main || isCliEntrypoint(import.meta.url)) {
	runSubAgentCli(SubAgentController.forSession, process.argv.slice(2));
}
