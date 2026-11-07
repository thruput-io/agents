import type { z } from "zod";
import type { CodeUnderReview } from "./code-under-review.ts";
import type { Ledger, Outcome, Row } from "./contracts.g.ts";
import { type LedgerProbe, ledgerFor } from "./ledger.ts";
import type { LedgerDirectory } from "./ledger-directory.ts";

export type LedgerSubmission =
	| { readonly kind: "recorded"; readonly ledger: Ledger }
	| {
			readonly kind: "submitted";
			readonly ledger: Ledger;
			readonly outcome: Outcome;
	  };

export interface SubAgentLedger {
	path: () => LedgerDirectory;
	pullRequest: () => CodeUnderReview;
	report: (rows: readonly Row[]) => z.ZodSafeParseResult<LedgerSubmission>;
}

export type OnReport = (ledger: Ledger) => LedgerSubmission;
export const recordOnly: OnReport = (ledger) => ({ kind: "recorded", ledger });

export class ProbeLedger<Probe extends LedgerProbe> implements SubAgentLedger {
	readonly #directory: LedgerDirectory;
	readonly #pullRequest: CodeUnderReview;
	readonly #probe: Probe;
	readonly #onReport: OnReport;
	private constructor(
		directory: LedgerDirectory,
		pullRequest: CodeUnderReview,
		probe: Probe,
		onReport: OnReport,
	) {
		this.#directory = directory;
		this.#pullRequest = pullRequest;
		this.#probe = probe;
		this.#onReport = onReport;
	}
	static of<ProbeType extends LedgerProbe>(
		directory: LedgerDirectory,
		pullRequest: CodeUnderReview,
		probe: ProbeType,
		onReport: OnReport,
	): ProbeLedger<ProbeType> {
		return new ProbeLedger(directory, pullRequest, probe, onReport);
	}
	path(): LedgerDirectory {
		return this.#directory;
	}
	pullRequest(): CodeUnderReview {
		return this.#pullRequest;
	}
	report(rows: readonly Row[]): z.ZodSafeParseResult<LedgerSubmission> {
		return ledgerFor(this.#probe)
			.transform(this.#onReport)
			.safeParse({ headCommit: this.#probe.surface.headCommit, rows });
	}
}
