import type {
	Change,
	Rulebook as ExternalRulebook,
	Outcome,
	Row,
	SurfaceFile,
} from "../domain/contracts.g.ts";
import {
	type DispatchResult,
	MainAgentController,
	type PrepareError,
} from "../domain/controller.ts";
import { runMainAgentCli } from "../domain/controller-cli.ts";
import { nonnull } from "../domain/nullish.ts";
import { runSubAgentCli } from "../domain/sub-agent-cli.ts";
import { SubAgentController } from "../domain/sub-agent-controller.ts";
import type { ScenarioRepo } from "./scenario-repo.ts";

export interface PreparedCliSuccess {
	readonly success: true;
	readonly session: string;
	readonly headCommit: string;
	readonly change: Change;
	readonly pending: readonly string[];
	readonly warning?: string;
}

export type PreparedCliPayload =
	| PreparedCliSuccess
	| { readonly success: false; readonly error: PrepareError };

export interface StatusCliPayload {
	readonly pending: readonly string[];
	readonly completed: readonly string[];
	readonly submittedOutcome: Outcome | null;
}

export interface InspectedProbePayload {
	readonly probe: string;
	readonly permissions: readonly string[];
	readonly instructions: readonly string[];
	readonly task: string;
	readonly change: Change;
	readonly surface: readonly SurfaceFile[];
	readonly rules:
		| {
				readonly kind: "rulebook";
				readonly ruleset: {
					readonly rules: ReadonlyArray<{ readonly id: string }>;
				};
		  }
		| {
				readonly kind: "rulesets";
				readonly rulesets: readonly ExternalRulebook[];
		  };
	readonly snapshotDirectory: string;
}

interface AckCliPayload {
	readonly success: true;
	readonly probe: string;
	readonly acknowledged: true;
	readonly deadlineMs: number;
	readonly permissions: readonly string[];
}

interface ReportCliPayload {
	readonly success: true;
	readonly kind: "recorded" | "submitted";
	readonly headCommit: string;
	readonly rowCount: number;
}

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
): Promise<InspectedProbePayload> => {
	const inspected = requireExitZero(
		await invokeSubCli<InspectedProbePayload>(["inspect", session, probeName]),
	);
	const acked = requireExitZero(
		await invokeSubCli<AckCliPayload>(["ack", session, probeName]),
	);
	if (!acked.acknowledged) {
		throw new Error(`Expected probe ${probeName} to be acknowledged`);
	}
	return inspected;
};

export const reportForProbe = async (
	session: string,
	probeName: string,
): Promise<InspectedProbePayload> => {
	const inspected = await inspectAndAck(session, probeName);
	const { rules } = inspected;
	const rows: readonly Row[] =
		rules.kind === "rulebook"
			? rules.ruleset.rules.map((rule) => ({
					rule: rule.id,
					examined: ["service.ts", "helper.ts"],
					verdict: "clean" as const,
					evidence: `Verified ${rule.id}`,
				}))
			: (() => {
					const first = nonnull(rules.rulesets[0]);
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
									observation: "Remove unused export y.",
									anchor: {
										kind: "surface" as const,
										path: "service.ts",
										side: "head" as const,
										lines: [
											{ idToReportViolationOn: 2, text: "export const y = 2;" },
										],
									},
								},
							],
						},
					];
				})();

	const reported = requireExitZero(
		await invokeSubCli<ReportCliPayload>([
			"report",
			session,
			probeName,
			JSON.stringify(rows),
		]),
	);
	if (!reported.success) {
		throw new Error(`Probe report failed for ${probeName}`);
	}
	return inspected;
};

export const reportForReReviewProbe = async (
	session: string,
	probeName: string,
): Promise<InspectedProbePayload> => {
	const inspected = await inspectAndAck(session, probeName);
	const { rules } = inspected;
	const rows: readonly Row[] =
		rules.kind === "rulesets"
			? (["R1", "R2", "R3"] as const).map((heading) => ({
					bookRule: { ruleset: nonnull(rules.rulesets[0]).url, heading },
					examined: ["helper.ts"],
					verdict: "clean" as const,
					evidence: "Clean",
				}))
			: rules.ruleset.rules.map((rule) =>
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
												{
													idToReportViolationOn: 1,
													text: "export const z = 4;",
												},
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
				);

	requireExitZero(
		await invokeSubCli<ReportCliPayload>([
			"report",
			session,
			probeName,
			JSON.stringify(rows),
		]),
	);
	return inspected;
};

export const runScenario = async (
	repo: ScenarioRepo,
	target: string,
	label: string,
): Promise<{
	readonly prepared: PreparedCliSuccess;
	readonly inspected: readonly InspectedProbePayload[];
	readonly dispatched: DispatchResult;
	readonly invoked: readonly string[];
}> => {
	const invoked: string[] = [];
	const inspected: InspectedProbePayload[] = [];
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
		inspected.push(await reportForProbe(prep.session, probeName));
	}
	const dispatched = requireExitZero(
		await invokeMainCli<DispatchResult>(["dispatch", workdir.toString()]),
	);
	return {
		prepared: prep,
		inspected,
		dispatched,
		invoked,
	};
};
