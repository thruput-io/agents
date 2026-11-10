import {
	type DispatchResult,
	MainAgentController,
	type ReadyReview,
} from "../domain/controller.ts";
import { nonnull } from "../domain/nullish.ts";
import type { SubAgentController } from "../domain/sub-agent-controller.ts";
import type { ScenarioRepo } from "./scenario-repo.ts";

export const reportForProbe = (sub: SubAgentController): void => {
	sub.ack();
	const rules = sub.rules();
	const handlers = {
		rulebook: () => {
			const rb = (rules as Extract<typeof rules, { kind: "rulebook" }>)
				.rulebook;
			const result = sub.report(
				[...rb].map((rule) => ({
					rule: rule.id,
					examined: ["service.ts", "helper.ts"],
					verdict: "clean" as const,
					evidence: `Verified ${rule.id}`,
				})),
			);
			if (!result.success) {
				throw new Error(`Probe report failed: ${result.error.message}`);
			}
		},
		rulesets: () => {
			const rs = (rules as Extract<typeof rules, { kind: "rulesets" }>)
				.rulesets;
			const first = nonnull(rs[0]);
			const result = sub.report([
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
							observation: "Remove unused export y.",
							anchor: {
								kind: "surface",
								path: "service.ts",
								side: "head",
								lines: [
									{ idToReportViolationOn: 2, text: "export const y = 2;" },
								],
							},
						},
					],
				},
			]);
			if (!result.success) {
				throw new Error(`Context probe report failed: ${result.error.message}`);
			}
		},
	};
	handlers[rules.kind]();
};

export const reportForReReviewProbe = (sub: SubAgentController): void => {
	sub.ack();
	const rules = sub.rules();
	if (rules.kind === "rulesets") {
		const first = nonnull(rules.rulesets[0]);
		sub.report([
			{
				bookRule: { ruleset: first.url, heading: "R1" },
				examined: ["helper.ts"],
				verdict: "clean",
				evidence: "Clean",
			},
			{
				bookRule: { ruleset: first.url, heading: "R2" },
				examined: ["helper.ts"],
				verdict: "clean",
				evidence: "Clean",
			},
			{
				bookRule: { ruleset: first.url, heading: "R3" },
				examined: ["helper.ts"],
				verdict: "clean",
				evidence: "Clean",
			},
		]);
		return;
	}
	sub.report(
		[...rules.rulebook].map((rule) =>
			rule.id === "Stated purpose"
				? {
						rule: rule.id,
						examined: ["helper.ts"],
						verdict: "violation" as const,
						evidence: "Recurring issue on helper.ts",
						violations: [
							{
								observation: "Still unused export z",
								anchor: {
									kind: "surface" as const,
									path: "helper.ts",
									side: "head" as const,
									lines: [
										{ idToReportViolationOn: 1, text: "export const z = 4;" },
									],
								},
							},
						],
					}
				: {
						rule: rule.id,
						examined: ["helper.ts"],
						verdict: "clean" as const,
						evidence: `Verified ${rule.id}`,
					},
		),
	);
};

export const runScenario = async (
	repo: ScenarioRepo,
	target: string,
	label: string,
): Promise<{
	readonly prepared: ReadyReview;
	readonly dispatched: DispatchResult;
	readonly invoked: readonly string[];
}> => {
	const invoked: string[] = [];
	const workdir = repo.workdirFor(label);
	const controller = MainAgentController.withRunner((probeName, sub) => {
		invoked.push(probeName);
		reportForProbe(sub);
	});
	Object.assign(process.env, {
		GH_TOKEN: "test-token",
		AZURE_DEVOPS_EXT_PAT: "test-token",
	});
	const prepared = await controller.prepare(target, workdir);
	if (!prepared.success) {
		throw new Error(`Expected ready review, got ${prepared.error.kind}`);
	}
	const dispatched = await controller.dispatch(workdir);
	return {
		prepared: prepared.data,
		dispatched,
		invoked,
	};
};
