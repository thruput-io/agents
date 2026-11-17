import type { CodeUnderReview } from "./code-under-review.ts";
import { ContextSubAgentLedger } from "./context-sub-agent-ledger.ts";
import type {
	AckPayload,
	Change,
	Checkout,
	ContextKind,
	ContextPermissions,
	ContextTask,
	DeadCodeKind,
	DeadCodePermissions,
	DeadCodeTask,
	Rulebook as ExternalRulebook,
	InstructionsProse,
	ReuseKind,
	ReusePermissions,
	ReuseTask,
	RulesetPageResponse,
	RulesetUrl,
	RulesKind,
	RulesPermissions,
	RulesTask,
	Surface,
} from "./contracts.g.ts";
import { DeadCodeSubAgentLedger } from "./dead-code-sub-agent-ledger.ts";
import type { CoordinatedProbeSpec } from "./main-agent-ledger.ts";
import { isNullOrEmpty, nonnull } from "./nullish.ts";
import { paginateText } from "./pagination.ts";
import type { SubAgentLedger } from "./probe-ledger.ts";
import { ReuseSubAgentLedger } from "./reuse-sub-agent-ledger.ts";
import type { Rulebook } from "./rulebook.ts";
import { RulesSubAgentLedger } from "./rules-sub-agent-ledger.ts";
import type { Workdir } from "./workdir.ts";

type LedgerDirectory = ReturnType<Workdir["ledgerDirectory"]>;

const CONTEXT_BOOK_RULE_ROWS = 3;

type AckValidationResult =
	| { readonly success: true }
	| { readonly success: false; readonly error: string };

type ProbeDocument =
	| {
			readonly instructions?: InstructionsProse;
			readonly task?: RulesTask | ReuseTask | DeadCodeTask;
			readonly permissions?:
				| RulesPermissions
				| ReusePermissions
				| DeadCodePermissions;
			readonly kind: RulesKind | ReuseKind | DeadCodeKind;
			readonly change: Change;
			readonly surface: Surface;
			readonly rulebook: Rulebook;
			readonly checkout?: Checkout;
	  }
	| {
			readonly instructions?: InstructionsProse;
			readonly task?: ContextTask;
			readonly permissions?: ContextPermissions;
			readonly kind: ContextKind;
			readonly change: Change;
			readonly surface: Surface;
			readonly rulesets: readonly ExternalRulebook[];
			readonly checkout?: Checkout;
	  };

type ProbeRules =
	| { readonly kind: "rulebook"; readonly rulebook: Rulebook }
	| {
			readonly kind: "rulesets";
			readonly rulesets: readonly ExternalRulebook[];
	  };

interface ProbeBehavior {
	readonly probe: ProbeDocument;
	readonly rules: ProbeRules;
	toLedger: (
		directory: LedgerDirectory,
		pullRequest: CodeUnderReview,
	) => SubAgentLedger;
	toCoordinatedSpec: (name: Checkout) => CoordinatedProbeSpec;
	validateAck: (payload: AckPayload) => AckValidationResult;
	ruleset: (url: RulesetUrl, page: number) => RulesetPageResponse;
}

interface ProbeStorage {
	readCursor: () => number | null;
	writeCursor: (index: number) => void;
	readAck: () => number | null;
	writeAck: (acknowledgedAt: number) => void;
}

const rulesProbeLedgers = {
	rules: RulesSubAgentLedger.from,
	"dead-code": DeadCodeSubAgentLedger.from,
	reuse: ReuseSubAgentLedger.from,
} as const;

type RulebookProbeDocument = Extract<
	ProbeDocument,
	{ readonly rulebook: Rulebook }
>;
type ContextProbeDocument = Extract<
	ProbeDocument,
	{ readonly kind: ContextKind }
>;

const HYDRATE_RULEBOOK_PROBE: Readonly<
	Record<
		RulebookProbeDocument["kind"],
		(
			probe: RulebookProbeDocument,
			checkoutDir: Checkout,
		) => RulebookProbeDocument
	>
> = {
	rules: (probe) => probe,
	"dead-code": (probe, checkoutDir) => ({
		...probe,
		checkout: probe.checkout ?? checkoutDir,
	}),
	reuse: (probe, checkoutDir) => ({
		...probe,
		checkout: probe.checkout ?? checkoutDir,
	}),
};

function contextProbeBehavior(
	probe: ContextProbeDocument,
	checkoutDir: Checkout,
): ProbeBehavior {
	const hydrated: ContextProbeDocument = {
		...probe,
		checkout: probe.checkout ?? checkoutDir,
	};
	return {
		probe: hydrated,
		rules: { kind: "rulesets", rulesets: hydrated.rulesets },
		toLedger: (directory, pullRequest) =>
			ContextSubAgentLedger.from(directory, pullRequest, hydrated),
		toCoordinatedSpec: (name) => ({ name, kind: "context", probe: hydrated }),
		validateAck: (payload) => {
			if (
				"bookRuleRows" in payload &&
				payload.bookRuleRows === CONTEXT_BOOK_RULE_ROWS
			) {
				return { success: true };
			}
			return {
				success: false,
				error:
					'Invalid ack payload for context probe. Expected JSON: {"message":"<dispatcher message received>","bookRuleRows":3,"observationFormat":"<observation> breaks <principle>"} because context probes report 3 bookRule rows whose observations complete "<observation> breaks <principle>".',
			};
		},
		ruleset: (url, page) => {
			const book = hydrated.rulesets.find((entry) => entry.url === url);
			if (isNullOrEmpty(book)) {
				return {
					success: false,
					error: `Unknown ruleset URL: ${url}. Choose one of the URLs returned in inspect under #/rulesets.`,
				};
			}
			const chunks = paginateText(book.text);
			if (page < 1 || page > chunks.length) {
				return {
					success: false,
					error: `Ruleset page ${page} is out of range for ${url} (valid pages: 1..${chunks.length}).`,
				};
			}
			return {
				success: true,
				url: book.url,
				title: book.title,
				page,
				totalPages: chunks.length,
				text: nonnull(chunks[page - 1]),
			};
		},
	};
}

function rulebookProbeBehavior(
	probe: RulebookProbeDocument,
	checkoutDir: Checkout,
): ProbeBehavior {
	const hydrated = HYDRATE_RULEBOOK_PROBE[probe.kind](probe, checkoutDir);
	return {
		probe: hydrated,
		rules: { kind: "rulebook", rulebook: hydrated.rulebook },
		toLedger: (directory, pullRequest) =>
			rulesProbeLedgers[hydrated.kind](directory, pullRequest, hydrated),
		toCoordinatedSpec: (name) => ({
			name,
			kind: hydrated.kind,
			probe: hydrated,
		}),
		validateAck: (payload) => {
			const expected = hydrated.rulebook.rules.map((rule) => rule.id);
			if (!("rulesInOrder" in payload)) {
				return {
					success: false,
					error: `Invalid ack payload for ${hydrated.kind} probe. Expected JSON with "rulesInOrder": ${JSON.stringify(expected)} and "observationFormat": "<observation> breaks <principle>".`,
				};
			}
			if (JSON.stringify(payload.rulesInOrder) !== JSON.stringify(expected)) {
				return {
					success: false,
					error: `Ack "rulesInOrder" must match #/ruleset/rules in exact order before probing. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(payload.rulesInOrder)}. Also include "observationFormat": "<observation> breaks <principle>".`,
				};
			}
			return { success: true };
		},
		ruleset: () => ({
			success: false,
			error: `Probe kind ${hydrated.kind} has no external rulesets; only context probes use the ruleset command.`,
		}),
	};
}

export function probeBehaviorFor(
	probe: ProbeDocument,
	checkoutDir: Checkout,
): ProbeBehavior {
	if (probe.kind === "context") {
		return contextProbeBehavior(probe, checkoutDir);
	}
	return rulebookProbeBehavior(probe, checkoutDir);
}

export type { ProbeBehavior, ProbeDocument, ProbeRules, ProbeStorage };

export function inMemoryProbeStorage(): ProbeStorage {
	return {
		readCursor: () => null,
		writeCursor: () => undefined,
		readAck: () => null,
		writeAck: () => undefined,
	};
}

export function persistedProbeStorage(
	directory: LedgerDirectory,
	name: string,
): ProbeStorage {
	return {
		readCursor: () => directory.readCursor(name),
		writeCursor: (index) => directory.writeCursor(name, index),
		readAck: () => directory.readAck(name),
		writeAck: (acknowledgedAt) => directory.writeAck(name, acknowledgedAt),
	};
}
