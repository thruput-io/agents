import type { Workdir } from "../adapters/fs/workdir.ts";
import {
	AckSuccessSchema,
	PageResponseSchema,
	PrepareReadySchema,
	PrepareResponseSchema,
	ReportSuccessSchema,
	type ReviewStatus,
	ReviewStatusSchema,
	SurfaceBoundarySchema,
	type SurfacePage,
} from "../domain/contracts.g.ts";
import { nonnull } from "../domain/nullish.ts";
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
		await invokeSubCli(["ack", session, probeName], AckSuccessSchema),
	);
	expectEqual(
		inspected.acknowledged,
		true,
		`Expected probe ${probeName} to be acknowledged`,
	);
	const driver = probeDriverFor(inspected);
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

const submitStagedProbe = async (
	session: string,
	stagedProbe: {
		readonly probeName: string;
		readonly inspected: InspectedProbePayload;
		readonly driver: ProbeDriver;
		readonly pages: readonly SurfacePage[];
	},
) => {
	const { probeName, inspected, driver, pages } = stagedProbe;
	const reported = requireExitZero(
		await invokeSubCli(
			[
				"report",
				session,
				probeName,
				JSON.stringify({
					oneRowPerRuleInOrder: driver.initialRows(pages),
				}),
			],
			ReportSuccessSchema,
		),
	);
	expectEqual(reported.success, true, `Probe report failed for ${probeName}`);
	return { inspected, pages, reported };
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
	readonly status: ReviewStatus;
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
	const initialRuns = await Promise.all(
		staged.slice(0, -1).map((entry) => submitStagedProbe(prep.session, entry)),
	);
	const finalRun = await submitStagedProbe(
		prep.session,
		nonnull(staged.at(-1)),
	);
	expectEqual(
		finalRun.reported.kind,
		"submitted",
		"Expected final probe report to submit the review",
	);
	const probeRuns = [...initialRuns, finalRun];
	const status = requireExitZero(
		await invokeMainCli(["status", workdir.toString()], ReviewStatusSchema),
	);
	return {
		workdir,
		prepared: prep,
		inspected: probeRuns.map((run) => run.inspected),
		pages: nonnull(probeRuns[0]).pages,
		status,
		invoked,
	};
};

export { reportForProbe, reportForReReviewProbe, runScenario };
