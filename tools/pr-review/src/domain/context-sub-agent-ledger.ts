import type { z } from "zod";
import type { CodeUnderReview } from "./code-under-review.ts";
import type { Row } from "./contracts.g.ts";
import type { ContextProbe } from "./ledger.ts";
import type { LedgerStore } from "./ports.ts";
import {
	type LedgerSubmission,
	type OnReport,
	ProbeLedger,
	recordOnly,
	type SubAgentLedger,
} from "./probe-ledger.ts";

export class ContextSubAgentLedger implements SubAgentLedger {
	readonly #inner: SubAgentLedger;
	private constructor(inner: SubAgentLedger) {
		this.#inner = inner;
	}
	static from(
		directory: LedgerStore,
		pullRequest: CodeUnderReview,
		probe: ContextProbe,
	): ContextSubAgentLedger {
		return new ContextSubAgentLedger(
			ProbeLedger.of(directory, pullRequest, probe, recordOnly),
		);
	}
	static withCallback(
		directory: LedgerStore,
		pullRequest: CodeUnderReview,
		probe: ContextProbe,
		onReport: OnReport,
	): ContextSubAgentLedger {
		return new ContextSubAgentLedger(
			ProbeLedger.of(directory, pullRequest, probe, onReport),
		);
	}
	path(): LedgerStore {
		return this.#inner.path();
	}
	pullRequest(): CodeUnderReview {
		return this.#inner.pullRequest();
	}
	report(rows: readonly Row[]): z.ZodSafeParseResult<LedgerSubmission> {
		return this.#inner.report(rows);
	}
}
