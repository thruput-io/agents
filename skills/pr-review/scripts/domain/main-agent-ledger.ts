import type { CodeUnderReview } from "./code-under-review.ts";
import { ContextSubAgentLedger } from "./context-sub-agent-ledger.ts";
import type {
	ContextKind,
	DeadCodeKind,
	Ledger,
	Outcome,
	ReuseKind,
	RulesKind,
} from "./contracts.g.ts";
import { DeadCodeSubAgentLedger } from "./dead-code-sub-agent-ledger.ts";
import { Instructions, type ProbePermissions } from "./instructions.ts";
import type { ContextProbe, RulesProbe } from "./ledger.ts";
import type { LedgerDirectory } from "./ledger-directory.ts";
import { merge } from "./ledger-table.ts";
import { isNullOrEmpty, nonnull } from "./nullish.ts";
import { outcome } from "./outcome.ts";
import type { OnReport, SubAgentLedger } from "./probe-ledger.ts";
import { ReuseSubAgentLedger } from "./reuse-sub-agent-ledger.ts";
import type { CitationRule } from "./rulebook.ts";
import { RulesSubAgentLedger } from "./rules-sub-agent-ledger.ts";

type CitationRulesProbe = RulesProbe & {
	readonly rulebook: { readonly rules: readonly CitationRule[] };
};

type CoordinatedProbeSpec =
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
	readonly permissionsByProbe: ReadonlyMap<string, ProbePermissions>;
	readonly sync: () => void;
	readonly completed: ReadonlySet<string>;
	readonly submitted: ReadonlyMap<
		string,
		{ readonly ledger: Ledger; readonly outcome: Outcome }
	>;
}

class MainAgentLedger {
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
		this.#state.sync();
		return this.#state.probeNames.filter(
			(name) => !this.#state.completed.has(name),
		);
	}

	permissions(probeName: string): ProbePermissions {
		return nonnull(this.#state.permissionsByProbe.get(probeName));
	}

	acknowledged(): readonly string[] {
		return this.pending().filter(
			(name) => !isNullOrEmpty(this.#directory.readAck(name)),
		);
	}

	unacknowledged(): readonly string[] {
		return this.pending().filter((name) =>
			isNullOrEmpty(this.#directory.readAck(name)),
		);
	}

	completed(): readonly string[] {
		this.#state.sync();
		return this.#state.probeNames.filter((name) =>
			this.#state.completed.has(name),
		);
	}

	submittedOutcome(): Outcome | null {
		this.#state.sync();
		return this.#state.submitted.get("submitted")?.outcome ?? null;
	}

	submittedLedger(): Ledger | null {
		this.#state.sync();
		return this.#state.submitted.get("submitted")?.ledger ?? null;
	}
}

const rulesLedgerFactories = {
	rules: RulesSubAgentLedger.withCallback,
	"dead-code": DeadCodeSubAgentLedger.withCallback,
	reuse: ReuseSubAgentLedger.withCallback,
} as const;

function settleIfComplete(
	directory: LedgerDirectory,
	pullRequest: CodeUnderReview,
	specs: readonly CoordinatedProbeSpec[],
	state: {
		readonly recorded: Map<number, Ledger>;
		readonly completed: Set<string>;
		readonly submitted: Map<
			string,
			{ readonly ledger: Ledger; readonly outcome: Outcome }
		>;
	},
): { readonly ledger: Ledger; readonly outcome: Outcome } | null {
	for (const [index, spec] of specs.entries()) {
		if (!state.recorded.has(index)) {
			const existing = directory.readSlice(spec.name);
			if (!isNullOrEmpty(existing)) {
				state.recorded.set(index, existing);
				state.completed.add(spec.name);
			}
		}
	}
	if (state.recorded.size < specs.length) {
		return null;
	}
	const entries = specs.map((entry, idx) => ({
		document: entry.probe,
		ledger: nonnull(state.recorded.get(idx)),
	}));
	const merged = merge(entries.map((entry) => entry.ledger));
	const finalOutcome = outcome(entries, pullRequest.threads().threads);
	const result = { ledger: merged, outcome: finalOutcome };
	state.submitted.set("submitted", result);
	return result;
}

export type { CoordinatedProbeSpec };
export { MainAgentLedger };

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
	const settle = () =>
		settleIfComplete(directory, pullRequest, specs, {
			recorded,
			completed,
			submitted,
		});
	const mainLedger = MainAgentLedger.from(directory, pullRequest, {
		probeNames: specs.map((spec) => spec.name),
		permissionsByProbe: new Map(
			specs.map((spec) => [
				spec.name,
				Instructions.forKind(spec.kind).permissions(),
			]),
		),
		sync: () => {
			settle();
		},
		completed,
		submitted,
	});
	const ledgers = specs.map((spec, index): SubAgentLedger => {
		const onReport: OnReport = (ledger) => {
			directory.writeSlice(spec.name, ledger);
			recorded.set(index, ledger);
			completed.add(spec.name);
			const settled = settle();
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
