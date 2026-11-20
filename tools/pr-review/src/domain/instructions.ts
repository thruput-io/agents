import {
	type Change,
	type Checkout,
	type Probe,
	ProbeSchema,
	type Rulebook,
	type RulebookSummary,
	type Ruleset,
	type Surface,
} from "./contracts.g.ts";
import { paginateText, surfaceOverview } from "./pagination.ts";

type ProbePermissions = Probe["permissions"];
type RulebookProbeKind = Exclude<Probe["kind"], "context">;

const CHECKOUT_FIELDS_BY_KIND: Record<
	RulebookProbeKind,
	(checkout: Checkout) => { readonly checkout?: Checkout }
> = {
	rules: () => ({}),
	"dead-code": (checkout) => ({ checkout }),
	reuse: (checkout) => ({ checkout }),
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
	const handed = [
		...probes.map((probe) => {
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
					kind: probe.kind,
					change: context.change,
					surface: overview,
					rulebook: probe.rulebook,
					...CHECKOUT_FIELDS_BY_KIND[probe.kind](context.checkout),
				},
			};
		}),
		(() => {
			const parsed = ProbeSchema.parse({
				kind: "context",
				change: context.change,
				surface: overview,
				rulesets: summaries,
				checkout: context.checkout,
			});
			return {
				name: "context",
				document: {
					instructions: parsed.instructions,
					task: parsed.task,
					permissions: parsed.permissions,
					kind: "context" as const,
					change: context.change,
					surface: overview,
					rulesets: summaries,
					checkout: context.checkout,
				},
			};
		})(),
	];
	return handed.map((probe, index) => ({
		name: `${String(index + 1).padStart(2, "0")}-${probe.name}`,
		document: probe.document,
	}));
}

export type { ProbePermissions };
export { instructions, toRulebookSummaries };
