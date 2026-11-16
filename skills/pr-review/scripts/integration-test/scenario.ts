import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { z } from "zod";
import {
	type AckSuccess,
	AckSuccessSchema,
	type AgentInstructions,
	AgentInstructionsSchema,
	type DispatchResult,
	DispatchResultSchema,
	PageResponseSchema,
	type PrepareReady,
	PrepareReadySchema,
	PrepareResponseSchema,
	ReportSuccessSchema,
	type Row,
	RulesetPageSchema,
	SurfaceBoundarySchema,
	type SurfacePage,
} from "../domain/contracts.g.ts";
import { nonnull } from "../domain/nullish.ts";
import type { Workdir } from "../domain/workdir.ts";
import { mockBridgeUrl, scenarioToken } from "./mock-server.ts";
import type { ScenarioRepo } from "./scenario-repo.ts";

export type PreparedCliSuccess = PrepareReady;
export type InspectedProbePayload = AgentInstructions;
type AckCliPayload = AckSuccess;

const fail = (message: string): never => {
	throw new Error(message);
};

const expectEqual = <T>(actual: T, expected: T, message: string): void => {
	const outcomes: Readonly<Record<string, () => void>> = {
		true: () => undefined,
		false: () =>
			fail(`${message} (expected ${String(expected)}, got ${String(actual)})`),
	};
	nonnull(outcomes[String(actual === expected)])();
};

const CONTROLLER_CLI_PATH = fileURLToPath(
	new URL("../domain/controller.ts", import.meta.url),
);
const SUB_AGENT_CLI_PATH = fileURLToPath(
	new URL("../domain/sub-agent-controller.ts", import.meta.url),
);
const PRELOAD_PATH = fileURLToPath(
	new URL("./msw-child-preload.ts", import.meta.url),
);

const runCliProcess = async <T>(
	entrypoint: string,
	args: readonly string[],
	schema: z.ZodType<T>,
): Promise<{ readonly exitCode: number; readonly payload: T }> => {
	const child = spawn(
		process.execPath,
		["--import", PRELOAD_PATH, entrypoint, ...args],
		{
			env: {
				...process.env,
				PR_REVIEW_MOCK_BRIDGE_URL: mockBridgeUrl(),
				GH_TOKEN: scenarioToken,
				AZURE_DEVOPS_EXT_PAT: scenarioToken,
			},
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	const stdoutChunks: Buffer[] = [];
	const stderrChunks: Buffer[] = [];
	child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
	child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
	const exitCode = await new Promise<number>((resolve, reject) => {
		child.on("error", reject);
		child.on("close", (code) => resolve(nonnull(code)));
	});
	const stdoutText = Buffer.concat(stdoutChunks).toString("utf8");
	const stderrText = Buffer.concat(stderrChunks).toString("utf8");
	expectEqual(
		stdoutText.length > 0,
		true,
		`CLI exited ${exitCode} with empty stdout; stderr: ${stderrText}`,
	);
	return {
		exitCode,
		payload: schema.parse(JSON.parse(stdoutText)),
	};
};

const requireExitZero = <T>(result: {
	readonly exitCode: number;
	readonly payload: T;
}): T => {
	expectEqual(result.exitCode, 0, `CLI command exited with ${result.exitCode}`);
	return result.payload;
};

export const invokeMainCli = <T>(
	args: readonly string[],
	schema: z.ZodType<T>,
): Promise<{ readonly exitCode: number; readonly payload: T }> =>
	runCliProcess(CONTROLLER_CLI_PATH, args, schema);

const invokeSubCli = <T>(
	args: readonly string[],
	schema: z.ZodType<T>,
): Promise<{ readonly exitCode: number; readonly payload: T }> =>
	runCliProcess(SUB_AGENT_CLI_PATH, args, schema);

interface ProbeDriver {
	ackPayload: (probeName: string) => Record<string, unknown>;
	verifyBeforeReport: (session: string, probeName: string) => Promise<void>;
	initialRows: () => readonly Row[];
	reReviewRows: () => readonly Row[];
}

const RE_REVIEW_VIOLATION_ROW: Row = {
	rule: "Stated purpose",
	examined: ["helper.ts"],
	verdict: "violation",
	evidence: "Recurring issue on helper.ts",
	violations: [
		{
			rule: "Stated purpose",
			idToReportViolationOn: 1,
			observation: "Still unused export z",
		},
	],
};

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
		initialRows: () => [
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
						idToReportViolationOn: 2,
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
		verifyBeforeReport: async () => undefined,
		initialRows: () =>
			inspected.ruleset.rules.map((rule) => ({
				rule: rule.id,
				examined: ["service.ts", "helper.ts"],
				verdict: "clean",
				evidence: `Verified ${rule.id}`,
			})),
		reReviewRows: () => {
			const overrides: Readonly<Record<string, Row>> = {
				"Stated purpose": RE_REVIEW_VIOLATION_ROW,
			};
			return inspected.ruleset.rules.map(
				(rule) =>
					overrides[rule.id] ?? {
						rule: rule.id,
						examined: ["helper.ts"],
						verdict: "clean",
						evidence: `Verified ${rule.id}`,
					},
			);
		},
	};
}

function probeDriverFor(inspected: InspectedProbePayload): ProbeDriver {
	switch (inspected.kind) {
		case "context":
			return contextProbeDriver(inspected);
		default:
			return rulebookProbeDriver(inspected);
	}
}

const inspectAndAck = async (
	session: string,
	probeName: string,
): Promise<{
	readonly inspected: InspectedProbePayload;
	readonly driver: ProbeDriver;
	readonly pages: readonly SurfacePage[];
}> => {
	const inspected = requireExitZero(
		await invokeSubCli(
			["inspect", session, probeName],
			AgentInstructionsSchema,
		),
	);
	const driver = probeDriverFor(inspected);
	const acked: AckCliPayload = requireExitZero(
		await invokeSubCli(
			["ack", session, probeName, JSON.stringify(driver.ackPayload(probeName))],
			AckSuccessSchema,
		),
	);
	expectEqual(
		acked.acknowledged,
		true,
		`Expected probe ${probeName} to be acknowledged`,
	);
	const pages: SurfacePage[] = [];
	let page = requireExitZero(
		await invokeSubCli(["next", session, probeName], PageResponseSchema),
	);
	while (page.success && page.status === "page") {
		pages.push(page);
		page = requireExitZero(
			await invokeSubCli(["next", session, probeName], PageResponseSchema),
		);
	}
	expectEqual(
		SurfaceBoundarySchema.parse(page).status,
		"end",
		"Expected surface paging to reach end",
	);
	return { inspected, driver, pages };
};

export const reportForProbe = async (
	session: string,
	probeName: string,
): Promise<{
	readonly inspected: InspectedProbePayload;
	readonly pages: readonly SurfacePage[];
}> => {
	const { inspected, driver, pages } = await inspectAndAck(session, probeName);
	await driver.verifyBeforeReport(session, probeName);
	const reported = requireExitZero(
		await invokeSubCli(
			[
				"report",
				session,
				probeName,
				JSON.stringify({ oneRowPerRuleInOrder: driver.initialRows() }),
			],
			ReportSuccessSchema,
		),
	);
	expectEqual(reported.success, true, `Probe report failed for ${probeName}`);
	return { inspected, pages };
};

export const reportForReReviewProbe = async (
	session: string,
	probeName: string,
): Promise<InspectedProbePayload> => {
	const { inspected, driver } = await inspectAndAck(session, probeName);
	requireExitZero(
		await invokeSubCli(
			[
				"report",
				session,
				probeName,
				JSON.stringify({ oneRowPerRuleInOrder: driver.reReviewRows() }),
			],
			ReportSuccessSchema,
		),
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
	const workdir = repo.workdirFor(label);
	const prep = PrepareReadySchema.parse(
		requireExitZero(
			await invokeMainCli(
				["prepare", target, workdir.toString()],
				PrepareResponseSchema,
			),
		),
	);
	const probeRuns: {
		readonly inspected: InspectedProbePayload;
		readonly pages: readonly SurfacePage[];
	}[] = [];
	for (const probeName of prep.pending) {
		invoked.push(probeName);
		probeRuns.push(await reportForProbe(prep.session, probeName));
	}
	const dispatched = requireExitZero(
		await invokeMainCli(["dispatch", workdir.toString()], DispatchResultSchema),
	);
	return {
		workdir,
		prepared: prep,
		inspected: probeRuns.map((run) => run.inspected),
		pages: nonnull(probeRuns[0]).pages,
		dispatched,
		invoked,
	};
};
