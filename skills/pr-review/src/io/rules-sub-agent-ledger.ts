import type { z } from "zod";
import type { CodeUnderReview } from "../domain/code-under-review.ts";
import type { Row } from "../domain/contracts.g.ts";
import type { RulesProbe } from "../domain/ledger.ts";
import type { LedgerDirectory } from "./ledger-directory.ts";
import {
	type LedgerSubmission,
	type OnReport,
	ProbeLedger,
	recordOnly,
	type SubAgentLedger,
} from "./probe-ledger.ts";

export class RulesSubAgentLedger implements SubAgentLedger {
	readonly #inner: SubAgentLedger;
	private constructor(inner: SubAgentLedger) {
		this.#inner = inner;
	}
	static from(
		directory: LedgerDirectory,
		pullRequest: CodeUnderReview,
		probe: RulesProbe,
	): RulesSubAgentLedger {
		return new RulesSubAgentLedger(
			ProbeLedger.of(directory, pullRequest, probe, recordOnly),
		);
	}
	static withCallback(
		directory: LedgerDirectory,
		pullRequest: CodeUnderReview,
		probe: RulesProbe,
		onReport: OnReport,
	): RulesSubAgentLedger {
		return new RulesSubAgentLedger(
			ProbeLedger.of(directory, pullRequest, probe, onReport),
		);
	}
	path(): LedgerDirectory {
		return this.#inner.path();
	}
	pullRequest(): CodeUnderReview {
		return this.#inner.pullRequest();
	}
	report(rows: readonly Row[]): z.ZodSafeParseResult<LedgerSubmission> {
		return this.#inner.report(rows);
	}
}
