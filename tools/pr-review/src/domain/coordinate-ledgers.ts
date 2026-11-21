import type { CodeUnderReview } from "./code-under-review.ts";
import type { Ledger, Outcome } from "./contracts.g.ts";
import { probeDefaultsForKind } from "./instructions.ts";
import { merge } from "./ledger-table.ts";
import {
	type CoordinatedProbeSpec,
	MainAgentLedger,
} from "./main-agent-ledger.ts";
import { isNullOrEmpty, nonnull } from "./nullish.ts";
import { outcome } from "./outcome.ts";
import type { LedgerStore } from "./ports.ts";
import {
	type OnReport,
	ProbeLedger,
	type SubAgentLedger,
} from "./probe-ledger.ts";

function settleIfComplete(options: {
	readonly directory: LedgerStore;
	readonly pullRequest: CodeUnderReview;
	readonly specs: readonly CoordinatedProbeSpec[];
	readonly recorded: Map<number, Ledger>;
	readonly completed: Set<string>;
	readonly submitted: Map<
		string,
		{ readonly ledger: Ledger; readonly outcome: Outcome }
	>;
}): { readonly ledger: Ledger; readonly outcome: Outcome } | null {
	const { directory, pullRequest, specs, recorded, completed, submitted } =
		options;
	for (const [index, spec] of specs.entries()) {
		if (!recorded.has(index)) {
			const existing = directory.readSlice(spec.name);
			if (!isNullOrEmpty(existing)) {
				recorded.set(index, existing);
				completed.add(spec.name);
			}
		}
	}
	if (recorded.size < specs.length) {
		return null;
	}
	const entries = specs.map((entry, idx) => ({
		document: entry.probe,
		ledger: nonnull(recorded.get(idx)),
	}));
	const merged = merge(entries.map((entry) => entry.ledger));
	const finalOutcome = outcome(entries, pullRequest.threads().threads);
	const result = { ledger: merged, outcome: finalOutcome };
	submitted.set("submitted", result);
	return result;
}

const createMainLedger = (
	directory: LedgerStore,
	pullRequest: CodeUnderReview,
	options: {
		readonly specs: readonly CoordinatedProbeSpec[];
		readonly now: () => number;
		readonly settle: () => void;
		readonly completed: ReadonlySet<string>;
		readonly submitted: ReadonlyMap<
			string,
			{ readonly ledger: Ledger; readonly outcome: Outcome }
		>;
	},
): MainAgentLedger => {
	const { specs, now, settle, completed, submitted } = options;
	const defaultsByProbe = specs
		.map((spec) => ({
			name: spec.name,
			defaults: probeDefaultsForKind(spec.kind),
		}))
		.sort(
			(left, right) => right.defaults.deadlineMs - left.defaults.deadlineMs,
		);
	return MainAgentLedger.from(directory, pullRequest, {
		probeNames: defaultsByProbe.map((entry) => entry.name),
		permissionsByProbe: new Map(
			defaultsByProbe.map((entry) => [entry.name, entry.defaults.permissions]),
		),
		deadlineMsByProbe: new Map(
			defaultsByProbe.map((entry) => [entry.name, entry.defaults.deadlineMs]),
		),
		now,
		sync: settle,
		completed,
		submitted,
	});
};

const createSubAgentLedgers = (
	directory: LedgerStore,
	pullRequest: CodeUnderReview,
	options: {
		readonly specs: readonly CoordinatedProbeSpec[];
		readonly recorded: Map<number, Ledger>;
		readonly completed: Set<string>;
		readonly settle: () => {
			readonly ledger: Ledger;
			readonly outcome: Outcome;
		} | null;
	},
): readonly SubAgentLedger[] => {
	const { specs, recorded, completed, settle } = options;
	return specs.map((spec, index): SubAgentLedger => {
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
		return ProbeLedger.withCallback(
			directory,
			pullRequest,
			spec.probe,
			onReport,
		);
	});
};

export function coordinateLedgersWithClock(
	directory: LedgerStore,
	pullRequest: CodeUnderReview,
	options: {
		readonly specs: readonly CoordinatedProbeSpec[];
		readonly now: () => number;
	},
): {
	readonly ledgers: readonly SubAgentLedger[];
	readonly mainLedger: MainAgentLedger;
} {
	const { specs, now } = options;
	const recorded = new Map<number, Ledger>();
	const completed = new Set<string>();
	const submitted = new Map<
		string,
		{ readonly ledger: Ledger; readonly outcome: Outcome }
	>();
	const settle = () =>
		settleIfComplete({
			directory,
			pullRequest,
			specs,
			recorded,
			completed,
			submitted,
		});
	const mainLedger = createMainLedger(directory, pullRequest, {
		specs,
		now,
		settle: () => {
			settle();
		},
		completed,
		submitted,
	});
	const ledgers = createSubAgentLedgers(directory, pullRequest, {
		specs,
		recorded,
		completed,
		settle,
	});
	return { ledgers, mainLedger };
}

export function coordinateLedgers(
	directory: LedgerStore,
	pullRequest: CodeUnderReview,
	specs: readonly CoordinatedProbeSpec[],
): {
	readonly ledgers: readonly SubAgentLedger[];
	readonly mainLedger: MainAgentLedger;
} {
	return coordinateLedgersWithClock(directory, pullRequest, {
		specs,
		now: Date.now,
	});
}
