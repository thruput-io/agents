import type { CodeUnderReview } from "../domain/code-under-review.ts";
import {
	type AckSuccess,
	AckSuccessSchema,
	type Checkout,
	type Rulebook as ExternalRulebook,
	type RulesetPageResponse,
	type RulesetUrl,
	type RulesPageResponse,
} from "../domain/contracts.g.ts";
import type { CoordinatedProbeSpec } from "../domain/main-agent-ledger.ts";
import { nonnull } from "../domain/nullish.ts";
import { paginateRulebook } from "../domain/pagination.ts";
import type { LedgerStore } from "../domain/ports.ts";
import {
	type ProbeDocument,
	toAgentInstructions,
} from "../domain/probe-document.ts";
import { ProbeLedger, type SubAgentLedger } from "../domain/probe-ledger.ts";
import type { Rulebook } from "../domain/rulebook.ts";
import {
	paginateContextRuleset,
	paginateProbeRulebook,
} from "./sub-agent-paging.ts";

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
		directory: LedgerStore,
		pullRequest: CodeUnderReview,
	) => SubAgentLedger;
	toCoordinatedSpec: (name: Checkout) => CoordinatedProbeSpec;
	ackAssignment: (probeName: Checkout) => AckSuccess;
	rulesPage: (page: number) => RulesPageResponse;
	ruleset: (url: RulesetUrl, page: number) => RulesetPageResponse;
}

type RulebookProbeDocument = Extract<
	ProbeDocument,
	{ readonly rulebook: Rulebook }
>;
type ContextProbeDocument = Extract<
	ProbeDocument,
	{ readonly kind: "context" }
>;

const resolveCheckout = (
	probe: { readonly checkout?: Checkout },
	fallback: Checkout,
): Checkout => {
	if (probe.checkout === undefined) {
		return fallback;
	}
	return probe.checkout;
};

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
		checkout: resolveCheckout(probe, checkoutDir),
	}),
	reuse: (probe, checkoutDir) => ({
		...probe,
		checkout: resolveCheckout(probe, checkoutDir),
	}),
};

const toRulebookAckSuccess = (
	hydrated: RulebookProbeDocument,
	probeName: Checkout,
): AckSuccess => {
	const serialized = toAgentInstructions(hydrated);
	const chunks = paginateRulebook(hydrated.rulebook.toRuleset());
	const base = {
		success: true,
		probe: probeName,
		acknowledged: true,
		deadlineMs: serialized.deadlineMs,
		task: serialized.task,
		permissions: serialized.permissions,
		kind: hydrated.kind,
		change: serialized.change,
		surface: serialized.surface,
		rulesOverview: {
			totalPages: chunks.length,
			ruleIds: hydrated.rulebook.rules.map((r) => r.id),
		},
	};
	if (hydrated.kind === "rules") {
		return AckSuccessSchema.parse(base);
	}
	return AckSuccessSchema.parse({
		...base,
		checkout: nonnull(hydrated.checkout),
	});
};

function contextProbeBehavior(
	probe: ContextProbeDocument,
	checkoutDir: Checkout,
): ProbeBehavior {
	const hydrated: ContextProbeDocument = {
		...probe,
		checkout: resolveCheckout(probe, checkoutDir),
	};
	return {
		probe: hydrated,
		rules: { kind: "rulesets", rulesets: hydrated.rulesets },
		toLedger: (directory, pullRequest) =>
			ProbeLedger.from(directory, pullRequest, hydrated),
		toCoordinatedSpec: (name) => ({ name, kind: "context", probe: hydrated }),
		ackAssignment: (probeName) => {
			const serialized = toAgentInstructions(hydrated);
			if (serialized.kind !== "context") {
				throw new Error(`Expected context probe, got ${serialized.kind}`);
			}
			return AckSuccessSchema.parse({
				...serialized,
				success: true,
				probe: probeName,
				acknowledged: true,
			});
		},
		rulesPage: () => ({
			success: false,
			error:
				"Probe kind context uses external rulesets; use the ruleset command.",
		}),
		ruleset: (url, page) =>
			paginateContextRuleset(hydrated.rulesets, url, page),
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
			ProbeLedger.from(directory, pullRequest, hydrated),
		toCoordinatedSpec: (name) => ({
			name,
			kind: hydrated.kind,
			probe: hydrated,
		}),
		ackAssignment: (probeName) => toRulebookAckSuccess(hydrated, probeName),
		rulesPage: (page) => paginateProbeRulebook(hydrated.rulebook, page),
		ruleset: () => ({
			success: false,
			error: `Probe kind ${hydrated.kind} has no external rulesets; use the rules command.`,
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

export type { ProbeBehavior, ProbeRules };
