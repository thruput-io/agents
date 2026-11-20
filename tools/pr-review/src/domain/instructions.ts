import {
	type Change,
	type Checkout,
	type Probe,
	ProbeSchema,
	type Rulebook,
	type RulebookSummary,
	type Ruleset,
	RulesetSchema,
	type Surface,
} from "./contracts.g.ts";
import { paginateText, surfaceOverview } from "./pagination.ts";

type ProbePermissions = Probe["permissions"];
type RulebookProbeKind = "rules" | "reuse" | "dead-code";
type ProbeKind = RulebookProbeKind | "context";

const SHA1_HEX_LENGTH = 40;
const DEAD_CODE_DEADLINE_MS = 360_000;
const REUSE_DEADLINE_MS = 300_000;

const DEFAULT_CHANGE: Change = {
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

const DEFAULT_SURFACE = {
	headCommit: "0".repeat(SHA1_HEX_LENGTH),
	changedFiles: 0,
	totalPages: 0,
};

const DEFAULT_SUMMARIES: readonly RulebookSummary[] = [
	{
		url: "https://thruput.se/agents/",
		title: "Rules",
		focus: "Focus",
		whenToUse: "Use",
		totalPages: 1,
	},
];

const RULEBOOK_PROBE_SPEC: Record<
	RulebookProbeKind,
	(checkout: Checkout) => {
		readonly deadlineMs?: 360000 | 300000;
		readonly checkout?: Checkout;
	}
> = {
	rules: () => ({}),
	"dead-code": (checkout) => ({
		deadlineMs: DEAD_CODE_DEADLINE_MS,
		checkout,
	}),
	reuse: (checkout) => ({
		deadlineMs: REUSE_DEADLINE_MS,
		checkout,
	}),
};

const probeDefaultsForKind = (
	kind: ProbeKind,
): Pick<Probe, "instructions" | "permissions" | "deadlineMs"> => {
	if (kind === "context") {
		return ProbeSchema.parse({
			change: DEFAULT_CHANGE,
			surface: DEFAULT_SURFACE,
			rulesets: DEFAULT_SUMMARIES,
			checkout: "/opt/pr-review/snapshot",
		});
	}
	return ProbeSchema.parse({
		change: DEFAULT_CHANGE,
		surface: DEFAULT_SURFACE,
		ruleset: DEFAULT_RULESET,
		...RULEBOOK_PROBE_SPEC[kind]("/opt/pr-review/snapshot"),
	});
};

const toRulebookSummaries = (
	rulesets: readonly Rulebook[],
): readonly RulebookSummary[] =>
	rulesets.map(({ url, title, focus, whenToUse, text }) => ({
		url,
		title,
		focus,
		whenToUse,
		totalPages: paginateText(text).length,
	}));

const toRulebookProbeEntry = <
	RulebookSlice extends { toRuleset: () => Ruleset },
>(
	context: {
		readonly change: Change;
		readonly surface: Surface;
		readonly checkout: Checkout;
	},
	probe: {
		readonly name: string;
		readonly kind: RulebookProbeKind;
		readonly rulebook: RulebookSlice;
	},
): {
	readonly name: string;
	readonly document: {
		readonly instructions: Probe["instructions"];
		readonly permissions: Probe["permissions"];
		readonly deadlineMs: Probe["deadlineMs"];
		readonly kind: RulebookProbeKind;
		readonly change: Change;
		readonly surface: ReturnType<typeof surfaceOverview>;
		readonly rulebook: RulebookSlice;
		readonly checkout?: Checkout;
	};
} => {
	const overview = surfaceOverview(context.surface);
	const spec = RULEBOOK_PROBE_SPEC[probe.kind](context.checkout);
	const parsed = ProbeSchema.parse({
		change: context.change,
		surface: overview,
		ruleset: probe.rulebook.toRuleset(),
		...spec,
	});
	const baseDoc = {
		instructions: parsed.instructions,
		permissions: parsed.permissions,
		deadlineMs: parsed.deadlineMs,
		kind: probe.kind,
		change: context.change,
		surface: overview,
		rulebook: probe.rulebook,
	};
	if (spec.checkout !== undefined) {
		return {
			name: probe.name,
			document: { ...baseDoc, checkout: spec.checkout },
		};
	}
	return {
		name: probe.name,
		document: baseDoc,
	};
};

function instructions<RulebookSlice extends { toRuleset: () => Ruleset }>(
	context: {
		readonly change: Change;
		readonly surface: Surface;
		readonly checkout: Checkout;
	},
	probes: readonly {
		readonly name: string;
		readonly kind: RulebookProbeKind;
		readonly rulebook: RulebookSlice;
	}[],
	rulesets: readonly Rulebook[],
) {
	const overview = surfaceOverview(context.surface);
	const summaries = toRulebookSummaries(rulesets);
	const parsedContext = ProbeSchema.parse({
		change: context.change,
		surface: overview,
		rulesets: summaries,
		checkout: context.checkout,
	});
	const handed = [
		...probes.map((probe) => toRulebookProbeEntry(context, probe)),
		{
			name: "context",
			document: {
				instructions: parsedContext.instructions,
				permissions: parsedContext.permissions,
				deadlineMs: parsedContext.deadlineMs,
				kind: "context" as const,
				change: context.change,
				surface: overview,
				rulesets: summaries,
				checkout: context.checkout,
			},
		},
	];
	return handed.map((probe, index) => ({
		name: `${String(index + 1).padStart(2, "0")}-${probe.name}`,
		document: probe.document,
	}));
}

export type { ProbePermissions, RulebookProbeKind };
export { instructions, probeDefaultsForKind, toRulebookSummaries };
