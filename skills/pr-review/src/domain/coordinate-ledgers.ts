import type { CodeUnderReview } from "./code-under-review.ts";
import { ContextSubAgentLedger } from "./context-sub-agent-ledger.ts";
import type { Ledger, Outcome } from "./contracts.g.ts";
import { DeadCodeSubAgentLedger } from "./dead-code-sub-agent-ledger.ts";
import { Instructions } from "./instructions.ts";
import { merge } from "./ledger-table.ts";
import {
	type CoordinatedProbeSpec,
	MainAgentLedger,
} from "./main-agent-ledger.ts";
import { isNullOrEmpty, nonnull } from "./nullish.ts";
import { outcome } from "./outcome.ts";
import type { LedgerStore } from "./ports.ts";
import type { OnReport, SubAgentLedger } from "./probe-ledger.ts";
import { ReuseSubAgentLedger } from "./reuse-sub-agent-ledger.ts";
import { RulesSubAgentLedger } from "./rules-sub-agent-ledger.ts";

const rulesLedgerFactories = {
	rules: RulesSubAgentLedger.withCallback,
	"dead-code": DeadCodeSubAgentLedger.withCallback,
	reuse: ReuseSubAgentLedger.withCallback,
} as const;

function settleIfComplete(
	directory: LedgerStore,
	pullRequest: CodeUnderReview,
	specs: readonly CoordinatedProbeSpec[],
	state: {
		readonly recorded: Map<number, Ledger>;
		readonly completed: Set<string>;
		readonly submitted: Map<
			string,
			{ readonly ledger: Ledger; readonly outcome: Outcome }
		>;
	},
): { readonly ledger: Ledger; readonly outcome: Outcome } | null {
	for (const [index, spec] of specs.entries()) {
		if (!state.recorded.has(index)) {
			const existing = directory.readSlice(spec.name);
			if (!isNullOrEmpty(existing)) {
				state.recorded.set(index, existing);
				state.completed.add(spec.name);
			}
		}
	}
	if (state.recorded.size < specs.length) {
		return null;
	}
	const entries = specs.map((entry, idx) => ({
		document: entry.probe,
		ledger: nonnull(state.recorded.get(idx)),
	}));
	const merged = merge(entries.map((entry) => entry.ledger));
	const finalOutcome = outcome(entries, pullRequest.threads().threads);
	const result = { ledger: merged, outcome: finalOutcome };
	state.submitted.set("submitted", result);
	return result;
}

const instructionsForSpec = (spec: CoordinatedProbeSpec): Instructions =>
	Instructions.fromParts({
		kind: spec.kind,
		instructions: spec.probe.instructions,
		task: spec.probe.task,
		permissions: spec.probe.permissions,
	});

export function coordinateLedgers(
	directory: LedgerStore,
	pullRequest: CodeUnderReview,
	specs: readonly CoordinatedProbeSpec[],
): {
	readonly ledgers: readonly SubAgentLedger[];
	readonly mainLedger: MainAgentLedger;
} {
	const recorded = new Map<number, Ledger>();
	const completed = new Set<string>();
	const submitted = new Map<
		string,
		{ readonly ledger: Ledger; readonly outcome: Outcome }
	>();
	const settle = () =>
		settleIfComplete(directory, pullRequest, specs, {
			recorded,
			completed,
			submitted,
		});
	const mainLedger = MainAgentLedger.from(directory, pullRequest, {
		probeNames: specs.map((spec) => spec.name),
		permissionsByProbe: new Map(
			specs.map((spec) => [spec.name, instructionsForSpec(spec).permissions()]),
		),
		promptsByProbe: new Map(
			specs.map((spec) => [spec.name, instructionsForSpec(spec).prompt()]),
		),
		sync: () => {
			settle();
		},
		completed,
		submitted,
	});
	const ledgers = specs.map((spec, index): SubAgentLedger => {
		const onReport: OnReport = (ledger) => {
			directory.writeSlice(spec.name, ledger);
			recorded.set(index, ledger);
			completed.add(spec.name);
			const settled = settle();
			if (isNullOrEmpty(settled)) {
				return { kind: "recorded", ledger };
			}
			return {
				kind: "submitted",
				ledger: settled.ledger,
				outcome: settled.outcome,
			};
		};
		if (spec.kind === "context") {
			return ContextSubAgentLedger.withCallback(
				directory,
				pullRequest,
				spec.probe,
				onReport,
			);
		}
		return rulesLedgerFactories[spec.kind](
			directory,
			pullRequest,
			spec.probe,
			onReport,
		);
	});
	return { ledgers, mainLedger };
}
