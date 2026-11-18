import type { z } from "zod";
import type { CodeUnderReview } from "./code-under-review.ts";
import type { Ledger, LedgerSubmission, Row } from "./contracts.g.ts";
import { type LedgerProbe, ledgerFor } from "./ledger.ts";
import type { LedgerStore } from "./ports.ts";

export type { LedgerSubmission } from "./contracts.g.ts";

export interface SubAgentLedger {
	path: () => LedgerStore;
	pullRequest: () => CodeUnderReview;
	report: (rows: readonly Row[]) => z.ZodSafeParseResult<LedgerSubmission>;
}

export type OnReport = (ledger: Ledger) => LedgerSubmission;
export const recordOnly: OnReport = (ledger) => ({ kind: "recorded", ledger });

export class ProbeLedger<Probe extends LedgerProbe> implements SubAgentLedger {
	readonly #directory: LedgerStore;
	readonly #pullRequest: CodeUnderReview;
	readonly #probe: Probe;
	readonly #onReport: OnReport;
	private constructor(
		directory: LedgerStore,
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
		directory: LedgerStore,
		pullRequest: CodeUnderReview,
		probe: ProbeType,
		onReport: OnReport,
	): ProbeLedger<ProbeType> {
		return new ProbeLedger(directory, pullRequest, probe, onReport);
	}
	path(): LedgerStore {
		return this.#directory;
	}
	pullRequest(): CodeUnderReview {
		return this.#pullRequest;
	}
	report(rows: readonly Row[]): z.ZodSafeParseResult<LedgerSubmission> {
		return ledgerFor(this.#probe)
			.transform(this.#onReport)
			.safeDecode({
				headCommit: this.#probe.surface.headCommit,
				rows: [...rows],
			});
	}
}
