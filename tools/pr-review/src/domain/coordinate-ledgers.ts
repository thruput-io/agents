import type { CodeUnderReview } from "./code-under-review.ts";
import {
	type Ledger,
	type Outcome,
	type Probe,
	ProbeSchema,
	RulesetSchema,
} from "./contracts.g.ts";
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

const SHA1_HEX_LENGTH = 40;

const DEFAULT_CHANGE: Probe["change"] = {
	host: {
		kind: "github",
		owner: "thruput-io",
		repository: "agents",
		number: 1,
	},
	author: "author",
	description: "",
};

const DEFAULT_RULESET = RulesetSchema.parse({
	rules: [
		{
			id: "Stated purpose",
			body: "State the [[Purpose]] of every [[Change]].",
			parent: "You aren't gonna need it",
			marker: "MUST",
			group: "Purpose",
		},
	],
	principles: [],
});

const permissionsForKind = (
	kind: CoordinatedProbeSpec["kind"],
): Probe["permissions"] => {
	const surface = {
		headCommit: "0".repeat(SHA1_HEX_LENGTH),
		changedFiles: 0,
		totalPages: 0,
	};
	if (kind === "context") {
		return ProbeSchema.parse({
			kind: "context",
			change: DEFAULT_CHANGE,
			surface,
			rulesets: [
				{
					url: "https://thruput.se/agents/",
					title: "Rules",
					focus: "Focus",
					whenToUse: "Use",
					totalPages: 1,
				},
			],
			checkout: "/opt/pr-review/snapshot",
		}).permissions;
	}
	if (kind === "rules") {
		return ProbeSchema.parse({
			kind: "rules",
			change: DEFAULT_CHANGE,
			surface,
			ruleset: DEFAULT_RULESET,
		}).permissions;
	}
	return ProbeSchema.parse({
		kind,
		change: DEFAULT_CHANGE,
		surface,
		ruleset: DEFAULT_RULESET,
		checkout: "/opt/pr-review/snapshot",
	}).permissions;
};

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
			specs.map((spec) => [spec.name, permissionsForKind(spec.kind)]),
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
		return ProbeLedger.withCallback(
			directory,
			pullRequest,
			spec.probe,
			onReport,
		);
	});
	return { ledgers, mainLedger };
}
