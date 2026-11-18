import type { CodeUnderReview } from "./code-under-review.ts";
import type {
	ContextKind,
	DeadCodeKind,
	Ledger,
	Outcome,
	ReuseKind,
	RulesKind,
} from "./contracts.g.ts";
import type { ProbePermissions } from "./instructions.ts";
import type { ContextProbe, RulesProbe } from "./ledger.ts";
import { isNullOrEmpty, nonnull } from "./nullish.ts";
import type { LedgerStore } from "./ports.ts";
import type { CitationRule } from "./rulebook.ts";

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
	readonly #directory: LedgerStore;
	readonly #pullRequest: CodeUnderReview;
	readonly #state: MainAgentLedgerState;

	private constructor(
		directory: LedgerStore,
		pullRequest: CodeUnderReview,
		state: MainAgentLedgerState,
	) {
		this.#directory = directory;
		this.#pullRequest = pullRequest;
		this.#state = state;
	}

	static from(
		directory: LedgerStore,
		pullRequest: CodeUnderReview,
		state: MainAgentLedgerState,
	): MainAgentLedger {
		return new MainAgentLedger(directory, pullRequest, state);
	}

	directory(): LedgerStore {
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
		const submitted = this.#state.submitted.get("submitted");
		if (submitted === undefined) {
			return null;
		}
		return submitted.outcome;
	}

	submittedLedger(): Ledger | null {
		this.#state.sync();
		const submitted = this.#state.submitted.get("submitted");
		if (submitted === undefined) {
			return null;
		}
		return submitted.ledger;
	}
}

export type { CoordinatedProbeSpec };
export { MainAgentLedger };
