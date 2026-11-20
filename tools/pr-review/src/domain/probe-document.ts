import { z } from "zod";
import {
	type Change,
	type Checkout,
	type Rulebook as ExternalRulebook,
	type Probe,
	ProbeSchema,
	type Surface,
} from "./contracts.g.ts";
import { toRulebookSummaries } from "./instructions.ts";
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

type RulebookProbeKind = Exclude<Probe["kind"], "context">;

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

const resolveCheckout = (checkout: Checkout | undefined): Checkout => {
	if (checkout === undefined) {
		return DEFAULT_CHECKOUT;
	}
	return checkout;
};

const toAgentInstructions = (probe: ProbeDocument): Probe => {
	const overview = surfaceOverview(probe.surface);
	if (probe.kind === "context") {
		return ProbeSchema.parse({
			kind: "context",
			change: probe.change,
			surface: overview,
			rulesets: [...toRulebookSummaries(probe.rulesets)],
			checkout: resolveCheckout(probe.checkout),
		});
	}
	if (probe.kind === "rules") {
		return ProbeSchema.parse({
			kind: "rules",
			change: probe.change,
			surface: overview,
			ruleset: probe.rulebook.toRuleset(),
		});
	}
	return ProbeSchema.parse({
		kind: probe.kind,
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
	if (document.kind === "context") {
		return {
			kind: "context",
			change: document.change,
			surface,
			rulesets,
			checkout: document.checkout,
		};
	}
	const parsedRulebook = nonnull(Rulebook.from(document.ruleset).data);
	if (document.kind === "rules") {
		return {
			kind: "rules",
			change: document.change,
			surface,
			rulebook: parsedRulebook,
		};
	}
	return {
		kind: document.kind,
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

export type {
	BundledProbes,
	NamedProbe,
	PersistedAudit,
	ProbeDocument,
	RulebookProbeKind,
};
export { loadPersistedProbes, toAgentInstructions };
