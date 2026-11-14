import type {
	AckSuccess,
	AgentInstructions,
	PageResponse,
	PrepareReady,
	PrepareResponse,
	ReportSuccess,
	ReviewStatus,
	Row,
	RulesetPage,
	SurfacePage,
} from "../domain/contracts.g.ts";
import {
	type DispatchResult,
	MainAgentController,
} from "../domain/controller.ts";
import { runMainAgentCli } from "../domain/controller-cli.ts";
import { nonnull } from "../domain/nullish.ts";
import { runSubAgentCli } from "../domain/sub-agent-cli.ts";
import { SubAgentController } from "../domain/sub-agent-controller.ts";
import type { Workdir } from "../domain/workdir.ts";
import type { ScenarioRepo } from "./scenario-repo.ts";

export type PreparedCliSuccess = PrepareReady;
export type PreparedCliPayload = PrepareResponse;
export type StatusCliPayload = ReviewStatus;
export type InspectedProbePayload = AgentInstructions;
type AckCliPayload = AckSuccess;
type ReportCliPayload = ReportSuccess;

const captureStdout = async <T>(
	fn: () => Promise<number> | number,
): Promise<{ readonly exitCode: number; readonly payload: T }> => {
	const chunks: string[] = [];
	const originalWrite = process.stdout.write.bind(process.stdout);
	process.stdout.write = ((chunk: string | Uint8Array): boolean => {
		if (typeof chunk === "string") {
			chunks.push(chunk);
			return true;
		}
		return originalWrite(chunk);
	}) as typeof process.stdout.write;
	try {
		const exitCode = await fn();
		return {
			exitCode,
			payload: JSON.parse(chunks.join("")) as T,
		};
	} finally {
		process.stdout.write = originalWrite;
	}
};

const requireExitZero = <T>(result: {
	readonly exitCode: number;
	readonly payload: T;
}): T => {
	if (result.exitCode !== 0) {
		throw new Error(`CLI command exited with ${result.exitCode}`);
	}
	return result.payload;
};

export const invokeMainCli = <T>(
	args: readonly string[],
): Promise<{ readonly exitCode: number; readonly payload: T }> =>
	captureStdout<T>(() => runMainAgentCli(MainAgentController.create(), args));

const invokeSubCli = <T>(
	args: readonly string[],
): Promise<{ readonly exitCode: number; readonly payload: T }> =>
	captureStdout<T>(() => runSubAgentCli(SubAgentController.forSession, args));

const inspectAndAck = async (
	session: string,
	probeName: string,
): Promise<{
	readonly inspected: InspectedProbePayload;
	readonly pages: readonly SurfacePage[];
}> => {
	const inspected = requireExitZero(
		await invokeSubCli<InspectedProbePayload>(["inspect", session, probeName]),
	);
	const ackPayload =
		inspected.kind === "context"
			? {
					message: `Run inspect ${probeName}`,
					bookRuleRows: 3,
					observationFormat: "<observation> breaks <principle>",
				}
			: {
					message: `Run inspect ${probeName}`,
					rulesInOrder: inspected.ruleset.rules.map((r) => r.id),
					observationFormat: "<observation> breaks <principle>",
				};
	const acked = requireExitZero(
		await invokeSubCli<AckCliPayload>([
			"ack",
			session,
			probeName,
			JSON.stringify(ackPayload),
		]),
	);
	if (!acked.acknowledged) {
		throw new Error(`Expected probe ${probeName} to be acknowledged`);
	}
	const pages: SurfacePage[] = [];
	let page = requireExitZero(
		await invokeSubCli<PageResponse>(["next", session, probeName]),
	);
	while (!page.success || page.status !== "end") {
		if (!page.success) {
			throw new Error(`Unexpected page error: ${page.error}`);
		}
		if (page.status === "page") {
			pages.push(page);
		}
		page = requireExitZero(
			await invokeSubCli<PageResponse>(["next", session, probeName]),
		);
	}
	return { inspected, pages };
};

export const reportForProbe = async (
	session: string,
	probeName: string,
): Promise<{
	readonly inspected: InspectedProbePayload;
	readonly pages: readonly SurfacePage[];
}> => {
	const { inspected, pages } = await inspectAndAck(session, probeName);
	if (inspected.kind === "context") {
		const first = nonnull(inspected.rulesets[0]);
		const rulesetPage = requireExitZero(
			await invokeSubCli<RulesetPage>([
				"ruleset",
				session,
				probeName,
				first.url,
			]),
		);
		if (!rulesetPage.success || rulesetPage.text.length === 0) {
			throw new Error(`Expected non-empty ruleset page for ${first.url}`);
		}
	}
	const rows: readonly Row[] =
		inspected.kind === "context"
			? (() => {
					const first = nonnull(inspected.rulesets[0]);
					return [
						{
							bookRule: { ruleset: first.url, heading: "R1" },
							examined: ["service.ts"],
							verdict: "clean" as const,
							evidence: "Domain model clean",
						},
						{
							bookRule: { ruleset: first.url, heading: "R2" },
							examined: ["service.ts"],
							verdict: "clean" as const,
							evidence: "Ubiquitous language clean",
						},
						{
							bookRule: { ruleset: first.url, heading: "R3" },
							examined: ["service.ts"],
							verdict: "violation" as const,
							evidence: "Export y has no caller",
							violations: [
								{
									rule: { ruleset: first.url, heading: "R3" },
									idToReportViolationOn: 2,
									observation: "Remove unused export y.",
								},
							],
						},
					];
				})()
			: inspected.ruleset.rules.map((rule) => ({
					rule: rule.id,
					examined: ["service.ts", "helper.ts"],
					verdict: "clean" as const,
					evidence: `Verified ${rule.id}`,
				}));

	const reported = requireExitZero(
		await invokeSubCli<ReportCliPayload>([
			"report",
			session,
			probeName,
			JSON.stringify({ oneRowPerRuleInOrder: rows }),
		]),
	);
	if (!reported.success) {
		throw new Error(`Probe report failed for ${probeName}`);
	}
	return { inspected, pages };
};

export const reportForReReviewProbe = async (
	session: string,
	probeName: string,
): Promise<InspectedProbePayload> => {
	const { inspected } = await inspectAndAck(session, probeName);
	const rows: readonly Row[] =
		inspected.kind === "context"
			? (["R1", "R2", "R3"] as const).map((heading) => ({
					bookRule: { ruleset: nonnull(inspected.rulesets[0]).url, heading },
					examined: ["helper.ts"],
					verdict: "clean" as const,
					evidence: "Clean",
				}))
			: inspected.ruleset.rules.map((rule) =>
					rule.id === "Stated purpose"
						? {
								rule: rule.id,
								examined: ["helper.ts"],
								verdict: "violation" as const,
								evidence: "Recurring issue on helper.ts",
								violations: [
									{
										rule: rule.id,
										idToReportViolationOn: 1,
										observation: "Still unused export z",
									},
								],
							}
						: {
								rule: rule.id,
								examined: ["helper.ts"],
								verdict: "clean" as const,
								evidence: `Verified ${rule.id}`,
							},
				);

	requireExitZero(
		await invokeSubCli<ReportCliPayload>([
			"report",
			session,
			probeName,
			JSON.stringify({ oneRowPerRuleInOrder: rows }),
		]),
	);
	return inspected;
};

export const runScenario = async (
	repo: ScenarioRepo,
	target: string,
	label: string,
): Promise<{
	readonly workdir: Workdir;
	readonly prepared: PreparedCliSuccess;
	readonly inspected: readonly InspectedProbePayload[];
	readonly pages: readonly SurfacePage[];
	readonly dispatched: DispatchResult;
	readonly invoked: readonly string[];
}> => {
	const invoked: string[] = [];
	const inspected: InspectedProbePayload[] = [];
	let firstPages: readonly SurfacePage[] = [];
	const workdir = repo.workdirFor(label);
	Object.assign(process.env, {
		GH_TOKEN: "test-token",
		AZURE_DEVOPS_EXT_PAT: "test-token",
	});
	const prep = requireExitZero(
		await invokeMainCli<PreparedCliPayload>([
			"prepare",
			target,
			workdir.toString(),
		]),
	);
	if (!prep.success) {
		throw new Error(`Expected ready review, got ${prep.error.kind}`);
	}
	for (const probeName of prep.pending) {
		invoked.push(probeName);
		const probeRun = await reportForProbe(prep.session, probeName);
		inspected.push(probeRun.inspected);
		if (firstPages.length === 0) {
			firstPages = probeRun.pages;
		}
	}
	const dispatched = requireExitZero(
		await invokeMainCli<DispatchResult>(["dispatch", workdir.toString()]),
	);
	return {
		workdir,
		prepared: prep,
		inspected,
		pages: firstPages,
		dispatched,
		invoked,
	};
};
