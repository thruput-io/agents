import type { z } from "zod";
import type { CodeUnderReview } from "./code-under-review.ts";
import type {
	Change,
	Checkout,
	ContextKind,
	ContextTask,
	DeadCodeKind,
	DeadCodeTask,
	Rulebook as ExternalRulebook,
	InstructionsProse,
	ReuseKind,
	ReuseTask,
	Row,
	RulesKind,
	RulesTask,
	Surface,
} from "./contracts.g.ts";
import { Instructions } from "./instructions.ts";
import type { Rulebook } from "./rulebook.ts";
import {
	ContextSubAgentLedger,
	DeadCodeSubAgentLedger,
	type LedgerSubmission,
	ReuseSubAgentLedger,
	RulesSubAgentLedger,
	type SubAgentLedger,
} from "./sub-agent-ledger.ts";
import type { Workdir } from "./workdir.ts";

export type ProbeDocument =
	| {
			readonly instructions?: InstructionsProse;
			readonly task?: RulesTask | ReuseTask | DeadCodeTask;
			readonly kind: RulesKind | ReuseKind | DeadCodeKind;
			readonly change: Change;
			readonly surface: Surface;
			readonly rulebook: Rulebook;
			readonly checkout?: Checkout;
	  }
	| {
			readonly instructions?: InstructionsProse;
			readonly task?: ContextTask;
			readonly kind: ContextKind;
			readonly change: Change;
			readonly surface: Surface;
			readonly rulesets: readonly ExternalRulebook[];
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
}

export class SubAgentController {
	readonly #workdir: Workdir;
	readonly #ledger: SubAgentLedger;
	readonly #instructions: Instructions;
	readonly #change: Change;
	readonly #rules: ProbeRules;

	private constructor(init: SubAgentControllerInit) {
		this.#workdir = init.workdir;
		this.#ledger = init.ledger;
		this.#instructions = init.instructions;
		this.#change = init.change;
		this.#rules = init.rules;
	}

	static from(
		workdir: Workdir,
		ledger: SubAgentLedger,
		change: Change,
	): SubAgentController {
		return new SubAgentController({
			workdir,
			ledger,
			instructions: Instructions.forKind("context"),
			change,
			rules: { kind: "rulesets", rulesets: [] },
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
	): SubAgentController {
		const rules: ProbeRules =
			probe.kind === "context"
				? { kind: "rulesets", rulesets: probe.rulesets }
				: { kind: "rulebook", rulebook: probe.rulebook };
		return new SubAgentController({
			workdir,
			ledger,
			instructions: Instructions.forKind(probe.kind),
			change: probe.change,
			rules,
		});
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

	report(rows: readonly Row[]): z.ZodSafeParseResult<LedgerSubmission> {
		return this.#ledger.report(rows);
	}
}
