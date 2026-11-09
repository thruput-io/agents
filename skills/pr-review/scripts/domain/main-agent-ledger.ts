import type { CodeUnderReview } from "./code-under-review.ts";
import type {
	ContextKind,
	DeadCodeKind,
	Ledger,
	Outcome,
	ReuseKind,
	RulesKind,
} from "./contracts.g.ts";
import type { ContextProbe, RulesProbe } from "./ledger.ts";
import type { LedgerDirectory } from "./ledger-directory.ts";
import { merge } from "./ledger-table.ts";
import { isNullOrEmpty, nonnull } from "./nullish.ts";
import { outcome } from "./outcome.ts";
import type { CitationRule } from "./rulebook.ts";
import {
	ContextSubAgentLedger,
	DeadCodeSubAgentLedger,
	type OnReport,
	ReuseSubAgentLedger,
	RulesSubAgentLedger,
	type SubAgentLedger,
} from "./sub-agent-ledger.ts";

type CitationRulesProbe = RulesProbe & {
	readonly rulebook: { readonly rules: readonly CitationRule[] };
};

export type CoordinatedProbeSpec =
	| {
			readonly name: string;
			readonly kind: RulesKind | DeadCodeKind | ReuseKind;
			readonly probe: CitationRulesProbe;
	  }
	| {
			readonly name: string;
			readonly kind: ContextKind;
			readonly probe: ContextProbe;
	  };

interface MainAgentLedgerState {
	readonly probeNames: readonly string[];
	readonly completed: ReadonlySet<string>;
	readonly submitted: ReadonlyMap<
		string,
		{ readonly ledger: Ledger; readonly outcome: Outcome }
	>;
}

export class MainAgentLedger {
	readonly #directory: LedgerDirectory;
	readonly #pullRequest: CodeUnderReview;
	readonly #state: MainAgentLedgerState;

	private constructor(
		directory: LedgerDirectory,
		pullRequest: CodeUnderReview,
		state: MainAgentLedgerState,
	) {
		this.#directory = directory;
		this.#pullRequest = pullRequest;
		this.#state = state;
	}

	static from(
		directory: LedgerDirectory,
		pullRequest: CodeUnderReview,
		state: MainAgentLedgerState,
	): MainAgentLedger {
		return new MainAgentLedger(directory, pullRequest, state);
	}

	directory(): LedgerDirectory {
		return this.#directory;
	}

	pullRequest(): CodeUnderReview {
		return this.#pullRequest;
	}

	pending(): readonly string[] {
		return this.#state.probeNames.filter(
			(name) => !this.#state.completed.has(name),
		);
	}

	completed(): readonly string[] {
		return this.#state.probeNames.filter((name) =>
			this.#state.completed.has(name),
		);
	}

	submittedOutcome(): Outcome | null {
		return this.#state.submitted.get("submitted")?.outcome ?? null;
	}

	submittedLedger(): Ledger | null {
		return this.#state.submitted.get("submitted")?.ledger ?? null;
	}
}

const rulesLedgerFactories = {
	rules: RulesSubAgentLedger.withCallback,
	"dead-code": DeadCodeSubAgentLedger.withCallback,
	reuse: ReuseSubAgentLedger.withCallback,
} as const;

export function coordinateLedgers(
	directory: LedgerDirectory,
	pullRequest: CodeUnderReview,
	specs: readonly CoordinatedProbeSpec[],
): {
	readonly ledgers: readonly SubAgentLedger[];
	readonly mainLedger: MainAgentLedger;
} {
	const recorded = new Map<number, Ledger>();
	const completed = new Set<string>();
	const submitted = new Map<
		string,
		{ readonly ledger: Ledger; readonly outcome: Outcome }
	>();
	const settleIfComplete = (): {
		readonly ledger: Ledger;
		readonly outcome: Outcome;
	} | null => {
		if (recorded.size < specs.length) {
			return null;
		}
		const entries = specs.map((entry, idx) => ({
			document: entry.probe,
			ledger: nonnull(recorded.get(idx)),
		}));
		const merged = merge(entries.map((entry) => entry.ledger));
		const finalOutcome = outcome(entries, pullRequest.threads().threads);
		const result = { ledger: merged, outcome: finalOutcome };
		submitted.set("submitted", result);
		return result;
	};
	for (const [index, spec] of specs.entries()) {
		const existing = directory.readSlice(spec.name);
		if (!isNullOrEmpty(existing)) {
			recorded.set(index, existing);
			completed.add(spec.name);
		}
	}
	settleIfComplete();
	const mainLedger = MainAgentLedger.from(directory, pullRequest, {
		probeNames: specs.map((spec) => spec.name),
		completed,
		submitted,
	});
	const ledgers = specs.map((spec, index): SubAgentLedger => {
		const onReport: OnReport = (ledger) => {
			directory.writeSlice(spec.name, ledger);
			recorded.set(index, ledger);
			completed.add(spec.name);
			const settled = settleIfComplete();
			if (isNullOrEmpty(settled)) {
				return { kind: "recorded", ledger };
			}
			return {
				kind: "submitted",
				ledger: settled.ledger,
				outcome: settled.outcome,
			};
		};
		if (spec.kind === "context") {
			return ContextSubAgentLedger.withCallback(
				directory,
				pullRequest,
				spec.probe,
				onReport,
			);
		}
		return rulesLedgerFactories[spec.kind](
			directory,
			pullRequest,
			spec.probe,
			onReport,
		);
	});
	return { ledgers, mainLedger };
}
