import {
	type Row,
	type RulebookSummary,
	RulesetPageSchema,
	type SurfaceLineId,
	type SurfacePage,
} from "../domain/contracts.g.ts";
import { nonnull } from "../domain/nullish.ts";
import { expectEqual, invokeSubCli, requireExitZero } from "./scenario-cli.ts";

interface ProbeDriver {
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

function contextProbeDriver(rulesets: readonly RulebookSummary[]): ProbeDriver {
	const first = nonnull(rulesets[0]);
	return {
		verifyBeforeReport: async (session, probeName) => {
			const rulesetPage = requireExitZero(
				await invokeSubCli(
					["rules", session, probeName, first.url],
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

function rulebookProbeDriver(ruleIds: readonly string[]): ProbeDriver {
	return {
		verifyBeforeReport: async () => undefined,
		initialRows: () =>
			ruleIds.map((ruleId) => ({
				rule: ruleId,
				examined: ["service.ts", "helper.ts"],
				verdict: "clean",
				evidence: `Verified ${ruleId}`,
			})),
		reReviewRows: (pages) => {
			const overrides = new Map<string, Row>([
				["Stated purpose", reReviewViolationRow(pages)],
			]);
			return ruleIds.map((ruleId) => {
				if (overrides.has(ruleId)) {
					return nonnull(overrides.get(ruleId));
				}
				return {
					rule: ruleId,
					examined: ["helper.ts"],
					verdict: "clean",
					evidence: `Verified ${ruleId}`,
				};
			});
		},
	};
}

export { contextProbeDriver, type ProbeDriver, rulebookProbeDriver };
