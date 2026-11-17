import type { z } from "zod";
import type { CodeUnderReview } from "./code-under-review.ts";
import type { Row } from "./contracts.g.ts";
import type { ContextProbe, RulesProbe } from "./ledger.ts";
import type { LedgerDirectory } from "./ledger-directory.ts";
import {
	type LedgerSubmission,
	type OnReport,
	ProbeLedger,
	recordOnly,
	type SubAgentLedger,
} from "./probe-ledger.ts";

export type { LedgerSubmission, OnReport, SubAgentLedger };

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

export class DeadCodeSubAgentLedger implements SubAgentLedger {
	readonly #inner: SubAgentLedger;
	private constructor(inner: SubAgentLedger) {
		this.#inner = inner;
	}
	static from(
		directory: LedgerDirectory,
		pullRequest: CodeUnderReview,
		probe: RulesProbe,
	): DeadCodeSubAgentLedger {
		return new DeadCodeSubAgentLedger(
			ProbeLedger.of(directory, pullRequest, probe, recordOnly),
		);
	}
	static withCallback(
		directory: LedgerDirectory,
		pullRequest: CodeUnderReview,
		probe: RulesProbe,
		onReport: OnReport,
	): DeadCodeSubAgentLedger {
		return new DeadCodeSubAgentLedger(
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

export class ReuseSubAgentLedger implements SubAgentLedger {
	readonly #inner: SubAgentLedger;
	private constructor(inner: SubAgentLedger) {
		this.#inner = inner;
	}
	static from(
		directory: LedgerDirectory,
		pullRequest: CodeUnderReview,
		probe: RulesProbe,
	): ReuseSubAgentLedger {
		return new ReuseSubAgentLedger(
			ProbeLedger.of(directory, pullRequest, probe, recordOnly),
		);
	}
	static withCallback(
		directory: LedgerDirectory,
		pullRequest: CodeUnderReview,
		probe: RulesProbe,
		onReport: OnReport,
	): ReuseSubAgentLedger {
		return new ReuseSubAgentLedger(
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

export class ContextSubAgentLedger implements SubAgentLedger {
	readonly #inner: SubAgentLedger;
	private constructor(inner: SubAgentLedger) {
		this.#inner = inner;
	}
	static from(
		directory: LedgerDirectory,
		pullRequest: CodeUnderReview,
		probe: ContextProbe,
	): ContextSubAgentLedger {
		return new ContextSubAgentLedger(
			ProbeLedger.of(directory, pullRequest, probe, recordOnly),
		);
	}
	static withCallback(
		directory: LedgerDirectory,
		pullRequest: CodeUnderReview,
		probe: ContextProbe,
		onReport: OnReport,
	): ContextSubAgentLedger {
		return new ContextSubAgentLedger(
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
