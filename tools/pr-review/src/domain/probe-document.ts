import { z } from "zod";
import {
	type Change,
	type Checkout,
	type Rulebook as ExternalRulebook,
	type Probe,
	ProbeSchema,
	type Surface,
} from "./contracts.g.ts";
import { type RulebookProbeKind, toRulebookSummaries } from "./instructions.ts";
import { nonnull } from "./nullish.ts";
import { surfaceOverview } from "./pagination.ts";
import { Rulebook } from "./rulebook.ts";

interface PersistedAudit {
	readonly name: Checkout;
	readonly document: Probe;
}

interface NamedProbe {
	readonly name: string;
	readonly probe: ProbeDocument;
	readonly auditDocument: Probe;
}

interface BundledProbes {
	readonly probes: readonly NamedProbe[];
	readonly rulesets: readonly ExternalRulebook[];
}

type ProbeDocument =
	| {
			readonly kind: RulebookProbeKind;
			readonly change: Change;
			readonly surface: Surface;
			readonly rulebook: Rulebook;
			readonly checkout?: Checkout;
	  }
	| {
			readonly kind: "context";
			readonly change: Change;
			readonly surface: Surface;
			readonly rulesets: readonly ExternalRulebook[];
			readonly checkout?: Checkout;
	  };

const DEFAULT_CHECKOUT = "/opt/pr-review/snapshot";
const DEAD_CODE_DEADLINE_MS = 360_000;
const REUSE_DEADLINE_MS = 300_000;

const DEADLINE_BY_KIND: Record<
	Exclude<RulebookProbeKind, "rules">,
	360_000 | 300_000
> = {
	"dead-code": DEAD_CODE_DEADLINE_MS,
	reuse: REUSE_DEADLINE_MS,
};

const resolveCheckout = (checkout: Checkout | undefined): Checkout => {
	if (checkout === undefined) {
		return DEFAULT_CHECKOUT;
	}
	return checkout;
};

const kindFromDeadline = (deadlineMs: number): RulebookProbeKind => {
	if (deadlineMs === DEAD_CODE_DEADLINE_MS) {
		return "dead-code";
	}
	return "reuse";
};

const toAgentInstructions = (probe: ProbeDocument): Probe => {
	const overview = surfaceOverview(probe.surface);
	if (probe.kind === "context") {
		return ProbeSchema.parse({
			change: probe.change,
			surface: overview,
			rulesets: [...toRulebookSummaries(probe.rulesets)],
			checkout: resolveCheckout(probe.checkout),
		});
	}
	if (probe.kind === "rules") {
		return ProbeSchema.parse({
			change: probe.change,
			surface: overview,
			ruleset: probe.rulebook.toRuleset(),
		});
	}
	return ProbeSchema.parse({
		deadlineMs: DEADLINE_BY_KIND[probe.kind],
		change: probe.change,
		surface: overview,
		ruleset: probe.rulebook.toRuleset(),
		checkout: resolveCheckout(probe.checkout),
	});
};

const fromAuditDocument = (
	document: Probe,
	surface: Surface,
	rulesets: readonly ExternalRulebook[],
): ProbeDocument => {
	if ("rulesets" in document) {
		return {
			kind: "context",
			change: document.change,
			surface,
			rulesets,
			checkout: document.checkout,
		};
	}
	const parsedRulebook = nonnull(Rulebook.from(document.ruleset).data);
	if (!("checkout" in document)) {
		return {
			kind: "rules",
			change: document.change,
			surface,
			rulebook: parsedRulebook,
		};
	}
	return {
		kind: kindFromDeadline(document.deadlineMs),
		change: document.change,
		surface,
		rulebook: parsedRulebook,
		checkout: document.checkout,
	};
};

const probeDocumentCodecFor = (
	surface: Surface,
	rulesets: readonly ExternalRulebook[],
) =>
	z.codec(
		ProbeSchema,
		z.custom<ProbeDocument>((val): val is ProbeDocument => val !== null),
		{
			decode: (document) => fromAuditDocument(document, surface, rulesets),
			encode: (probe) => toAgentInstructions(probe),
		},
	);

const loadPersistedProbes = (
	audits: readonly PersistedAudit[],
	surface: Surface,
	rulesets: readonly ExternalRulebook[],
): readonly NamedProbe[] => {
	const codec = probeDocumentCodecFor(surface, rulesets);
	return audits.map(({ name, document }) => ({
		name,
		probe: codec.decode(document),
		auditDocument: document,
	}));
};

export type { BundledProbes, NamedProbe, PersistedAudit, ProbeDocument };
export { loadPersistedProbes, toAgentInstructions };
