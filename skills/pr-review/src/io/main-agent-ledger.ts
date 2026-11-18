import type { CodeUnderReview } from "../domain/code-under-review.ts";
import type {
	ContextKind,
	DeadCodeKind,
	Ledger,
	Outcome,
	ReuseKind,
	RulesKind,
} from "../domain/contracts.g.ts";
import type { ProbePermissions } from "../domain/instructions.ts";
import type { ContextProbe, RulesProbe } from "../domain/ledger.ts";
import { isNullOrEmpty, nonnull } from "../domain/nullish.ts";
import type { CitationRule } from "../domain/rulebook.ts";
import type { LedgerDirectory } from "./ledger-directory.ts";

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
