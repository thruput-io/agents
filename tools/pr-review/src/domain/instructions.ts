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
type RulebookProbeKind = Exclude<Probe["kind"], "context">;

const SHA1_HEX_LENGTH = 40;

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

const CHECKOUT_FIELDS_BY_KIND: Record<
	RulebookProbeKind,
	(checkout: Checkout) => { readonly checkout?: Checkout }
> = {
	rules: () => ({}),
	"dead-code": (checkout) => ({ checkout }),
	reuse: (checkout) => ({ checkout }),
};

const probeDefaultsForKind = (
	kind: Probe["kind"],
): Pick<Probe, "permissions" | "deadlineMs"> => {
	if (kind === "context") {
		return ProbeSchema.parse({
			kind: "context",
			change: DEFAULT_CHANGE,
			surface: DEFAULT_SURFACE,
			rulesets: DEFAULT_SUMMARIES,
			checkout: "/opt/pr-review/snapshot",
		});
	}
	return ProbeSchema.parse({
		kind,
		change: DEFAULT_CHANGE,
		surface: DEFAULT_SURFACE,
		ruleset: DEFAULT_RULESET,
		...CHECKOUT_FIELDS_BY_KIND[kind]("/opt/pr-review/snapshot"),
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
) => {
	const overview = surfaceOverview(context.surface);
	const parsed = ProbeSchema.parse({
		kind: probe.kind,
		change: context.change,
		surface: overview,
		ruleset: probe.rulebook.toRuleset(),
		...CHECKOUT_FIELDS_BY_KIND[probe.kind](context.checkout),
	});
	return {
		name: probe.name,
		document: {
			instructions: parsed.instructions,
			task: parsed.task,
			permissions: parsed.permissions,
			deadlineMs: parsed.deadlineMs,
			kind: probe.kind,
			change: context.change,
			surface: overview,
			rulebook: probe.rulebook,
			...CHECKOUT_FIELDS_BY_KIND[probe.kind](context.checkout),
		},
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
		kind: "context",
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
				task: parsedContext.task,
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

export type { ProbePermissions };
export { instructions, probeDefaultsForKind, toRulebookSummaries };
