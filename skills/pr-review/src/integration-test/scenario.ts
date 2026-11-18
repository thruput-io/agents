import {
	type AckSuccess,
	AckSuccessSchema,
	AgentInstructionsSchema,
	type DispatchResult,
	DispatchResultSchema,
	PageResponseSchema,
	PrepareReadySchema,
	PrepareResponseSchema,
	ReportSuccessSchema,
	SurfaceBoundarySchema,
	type SurfacePage,
} from "../domain/contracts.g.ts";
import { nonnull } from "../domain/nullish.ts";
import type { Workdir } from "../io/workdir.ts";
import {
	expectEqual,
	type InspectedProbePayload,
	invokeMainCli,
	invokeSubCli,
	type PreparedCliSuccess,
	requireExitZero,
} from "./scenario-cli.ts";
import { type ProbeDriver, probeDriverFor } from "./scenario-drivers.ts";
import type { ScenarioRepo } from "./scenario-repo.ts";

type AckCliPayload = AckSuccess;

const collectSurfacePages = async (
	session: string,
	probeName: string,
	pages: SurfacePage[] = [],
): Promise<readonly SurfacePage[]> => {
	const page = requireExitZero(
		await invokeSubCli(["next", session, probeName], PageResponseSchema),
	);
	if (page.success && page.status === "page") {
		pages.push(page);
		return collectSurfacePages(session, probeName, pages);
	}
	expectEqual(
		SurfaceBoundarySchema.parse(page).status,
		"end",
		"Expected surface paging to reach end",
	);
	return pages;
};

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
	const pages = await collectSurfacePages(session, probeName);
	return { inspected, driver, pages };
};

const reportForProbe = async (
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
				JSON.stringify({ oneRowPerRuleInOrder: driver.initialRows(pages) }),
			],
			ReportSuccessSchema,
		),
	);
	expectEqual(reported.success, true, `Probe report failed for ${probeName}`);
	return { inspected, pages };
};

const reportForReReviewProbe = async (
	session: string,
	probeName: string,
): Promise<InspectedProbePayload> => {
	const { inspected, driver, pages } = await inspectAndAck(session, probeName);
	requireExitZero(
		await invokeSubCli(
			[
				"report",
				session,
				probeName,
				JSON.stringify({ oneRowPerRuleInOrder: driver.reReviewRows(pages) }),
			],
			ReportSuccessSchema,
		),
	);
	return inspected;
};

const runScenario = async (
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
	const workdir = repo.workdirFor(label);
	const prep = PrepareReadySchema.parse(
		requireExitZero(
			await invokeMainCli(
				["prepare", target, workdir.toString()],
				PrepareResponseSchema,
			),
		),
	);
	const invoked = [...prep.pending];
	const staged = await Promise.all(
		prep.pending.map(async (probeName) => {
			const { inspected, driver, pages } = await inspectAndAck(
				prep.session,
				probeName,
			);
			await driver.verifyBeforeReport(prep.session, probeName);
			return { probeName, inspected, driver, pages };
		}),
	);
	const probeRuns = await Promise.all(
		staged.map(async ({ probeName, inspected, driver, pages }) => {
			const reported = requireExitZero(
				await invokeSubCli(
					[
						"report",
						prep.session,
						probeName,
						JSON.stringify({
							oneRowPerRuleInOrder: driver.initialRows(pages),
						}),
					],
					ReportSuccessSchema,
				),
			);
			expectEqual(
				reported.success,
				true,
				`Probe report failed for ${probeName}`,
			);
			return { inspected, pages };
		}),
	);
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

export { reportForProbe, reportForReReviewProbe, runScenario };
