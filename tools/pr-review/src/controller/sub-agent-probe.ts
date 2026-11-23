import type { CodeUnderReview } from "../domain/code-under-review.ts";
import {
	type AckSuccess,
	AckSuccessSchema,
	type Checkout,
	type Rulebook as ExternalRulebook,
	type InstructionsSuccess,
	InstructionsSuccessSchema,
	type RulesetUrl,
	type RulesResponse,
} from "../domain/contracts.g.ts";
import { toRulebookSummaries } from "../domain/instructions.ts";
import type { CoordinatedProbeSpec } from "../domain/main-agent-ledger.ts";
import type { LedgerStore } from "../domain/ports.ts";
import {
	type ProbeDocument,
	toAgentInstructions,
} from "../domain/probe-document.ts";
import { ProbeLedger, type SubAgentLedger } from "../domain/probe-ledger.ts";
import type { Rulebook } from "../domain/rulebook.ts";
import { paginateContextRuleset } from "./sub-agent-paging.ts";

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
	instructionsResponse: (probeName: Checkout) => InstructionsSuccess;
	ackResponse: (probeName: Checkout) => AckSuccess;
	rulesResponse: (url?: RulesetUrl, page?: number) => RulesResponse;
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

const toInstructionsSuccess = (
	hydrated: ProbeDocument,
	probeName: Checkout,
): InstructionsSuccess => {
	const serialized = toAgentInstructions(hydrated);
	const base = {
		success: true,
		probe: probeName,
		deadlineMs: serialized.deadlineMs,
		permissions: serialized.permissions,
		instructions: serialized.instructions,
	};
	if ("checkout" in serialized) {
		return InstructionsSuccessSchema.parse({
			...base,
			checkout: serialized.checkout,
		});
	}
	return InstructionsSuccessSchema.parse(base);
};

const toAckSuccess = (
	hydrated: ProbeDocument,
	probeName: Checkout,
): AckSuccess => {
	const serialized = toAgentInstructions(hydrated);
	return AckSuccessSchema.parse({
		success: true,
		probe: probeName,
		acknowledged: true,
		deadlineMs: serialized.deadlineMs,
		permissions: serialized.permissions,
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
		instructionsResponse: (probeName) =>
			toInstructionsSuccess(hydrated, probeName),
		ackResponse: (probeName) => toAckSuccess(hydrated, probeName),
		rulesResponse: (url, page) => {
			if (url === undefined) {
				return {
					success: true,
					rulesets: [...toRulebookSummaries(hydrated.rulesets)],
				};
			}
			return paginateContextRuleset(hydrated.rulesets, url, page ?? 1);
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
			ProbeLedger.from(directory, pullRequest, hydrated),
		toCoordinatedSpec: (name) => ({
			name,
			kind: hydrated.kind,
			probe: hydrated,
		}),
		instructionsResponse: (probeName) =>
			toInstructionsSuccess(hydrated, probeName),
		ackResponse: (probeName) => toAckSuccess(hydrated, probeName),
		rulesResponse: (url) => {
			if (url !== undefined) {
				return {
					success: false,
					error:
						"This probe has no external rulebook URLs; call rules without a URL.",
				};
			}
			return {
				success: true,
				ruleset: hydrated.rulebook.toRuleset(),
			};
		},
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
