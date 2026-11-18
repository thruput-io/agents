import {
	type Row,
	RulesetPageSchema,
	type SurfaceLineId,
	type SurfacePage,
} from "../domain/contracts.g.ts";
import { nonnull } from "../domain/nullish.ts";
import {
	expectEqual,
	type InspectedProbePayload,
	invokeSubCli,
	requireExitZero,
} from "./scenario-cli.ts";

interface ProbeDriver {
	ackPayload: (probeName: string) => Record<string, unknown>;
	verifyBeforeReport: (session: string, probeName: string) => Promise<void>;
	initialRows: (pages: readonly SurfacePage[]) => readonly Row[];
	reReviewRows: (pages: readonly SurfacePage[]) => readonly Row[];
}

const surfaceLineId = (
	pages: readonly SurfacePage[],
	filePath: string,
	lineText: string,
): SurfaceLineId =>
	nonnull(
		pages
			.filter((page) => page.path === filePath)
			.flatMap((page) => page.fragments)
			.filter((fragment) => fragment.kind === "surface")
			.flatMap((fragment) => fragment.lines)
			.find((line) => line.text === lineText),
	).idToReportViolationOn;

const reReviewViolationRow = (pages: readonly SurfacePage[]): Row => ({
	rule: "Stated purpose",
	examined: ["helper.ts"],
	verdict: "violation",
	evidence: "Recurring issue on helper.ts",
	violations: [
		{
			rule: "Stated purpose",
			idToReportViolationOn: surfaceLineId(
				pages,
				"helper.ts",
				"export const z = 4;",
			),
			observation: "Still unused export z",
		},
	],
});

function contextProbeDriver(
	inspected: Extract<InspectedProbePayload, { readonly kind: "context" }>,
): ProbeDriver {
	const first = nonnull(inspected.rulesets[0]);
	return {
		ackPayload: (probeName) => ({
			message: `Run inspect ${probeName}`,
			bookRuleRows: 3,
			observationFormat: "<observation> breaks <principle>",
		}),
		verifyBeforeReport: async (session, probeName) => {
			const rulesetPage = requireExitZero(
				await invokeSubCli(
					["ruleset", session, probeName, first.url],
					RulesetPageSchema,
				),
			);
			expectEqual(
				rulesetPage.text.length > 0,
				true,
				`Expected non-empty ruleset page for ${first.url}`,
			);
		},
		initialRows: (pages) => [
			{
				bookRule: { ruleset: first.url, heading: "R1" },
				examined: ["service.ts"],
				verdict: "clean",
				evidence: "Domain model clean",
			},
			{
				bookRule: { ruleset: first.url, heading: "R2" },
				examined: ["service.ts"],
				verdict: "clean",
				evidence: "Ubiquitous language clean",
			},
			{
				bookRule: { ruleset: first.url, heading: "R3" },
				examined: ["service.ts"],
				verdict: "violation",
				evidence: "Export y has no caller",
				violations: [
					{
						rule: { ruleset: first.url, heading: "R3" },
						idToReportViolationOn: surfaceLineId(
							pages,
							"service.ts",
							"export const y = 2;",
						),
						observation: "Remove unused export y.",
					},
				],
			},
		],
		reReviewRows: () =>
			(["R1", "R2", "R3"] as const).map((heading) => ({
				bookRule: { ruleset: first.url, heading },
				examined: ["helper.ts"],
				verdict: "clean",
				evidence: "Clean",
			})),
	};
}

function rulebookProbeDriver(
	inspected: Exclude<InspectedProbePayload, { readonly kind: "context" }>,
): ProbeDriver {
	return {
		ackPayload: (probeName) => ({
			message: `Run inspect ${probeName}`,
			rulesInOrder: inspected.ruleset.rules.map((r) => r.id),
			observationFormat: "<observation> breaks <principle>",
		}),
		verifyBeforeReport: async () => {
			await Promise.resolve();
		},
		initialRows: () =>
			inspected.ruleset.rules.map((rule) => ({
				rule: rule.id,
				examined: ["service.ts", "helper.ts"],
				verdict: "clean",
				evidence: `Verified ${rule.id}`,
			})),
		reReviewRows: (pages) => {
			const overrides = new Map<string, Row>([
				["Stated purpose", reReviewViolationRow(pages)],
			]);
			return inspected.ruleset.rules.map((rule) => {
				if (overrides.has(rule.id)) {
					return nonnull(overrides.get(rule.id));
				}
				return {
					rule: rule.id,
					examined: ["helper.ts"],
					verdict: "clean",
					evidence: `Verified ${rule.id}`,
				};
			});
		},
	};
}

function probeDriverFor(inspected: InspectedProbePayload): ProbeDriver {
	if (inspected.kind === "context") {
		return contextProbeDriver(inspected);
	}
	return rulebookProbeDriver(inspected);
}

export { type ProbeDriver, probeDriverFor };
