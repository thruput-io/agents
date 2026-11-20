import { z } from "zod";
import type { AckResult } from "../controller/sub-agent-controller.ts";
import type { ProbeRules } from "../controller/sub-agent-probe.ts";
import type { CodeUnderReview } from "../domain/code-under-review.ts";
import {
	type Change,
	type Checkout,
	type PageResponse,
	type ReportResponse,
	type Row,
	type RulesetPageResponse,
	type RulesetUrl,
	type RulesPageResponse,
	SubAgentCommandSchema,
} from "../domain/contracts.g.ts";
import type { HostAdapterPort } from "../domain/host-adapter.ts";
import type {
	DefineLookupResult,
	WorkspaceFactoryPort,
	WorkspacePort,
} from "../domain/ports.ts";
import type { LedgerSubmission } from "../domain/probe-ledger.ts";
import {
	failCli,
	failWithJsonError,
	parseSchemaCli,
	writeJson,
} from "./cli.ts";
import { toRawSubAgentCommand } from "./sub-agent-args.ts";

interface SubAgentCliTarget {
	workdir: () => WorkspacePort;
	change: () => Change;
	codeUnderReview: () => CodeUnderReview;
	rules: () => ProbeRules;
	rulesPage: (page: number) => RulesPageResponse;
	next: () => PageResponse;
	prev: () => PageResponse;
	ruleset: (url: RulesetUrl, page: number) => RulesetPageResponse;
	ack: () => AckResult;
	report: (rows: readonly Row[]) => z.ZodSafeParseResult<LedgerSubmission>;
	submitReport: (
		rows: readonly Row[],
		adapters: HostAdapterPort,
	) => Promise<z.ZodSafeParseResult<LedgerSubmission>>;
}

interface SubAgentCliDeps {
	readonly workspaceFactory: WorkspaceFactoryPort;
	readonly forSession: (session: Checkout, name: Checkout) => SubAgentCliTarget;
	readonly resolveDefinition: (
		term: string,
		depth: number,
	) => DefineLookupResult;
	readonly adapters: HostAdapterPort;
}

const SUBAGENT_COMMANDS = [
	"define",
	"ack",
	"rules",
	"next",
	"prev",
	"ruleset",
	"report",
].join("|");
const MISSING_COMMAND_USAGE = `Usage: review-tool-probe.mjs <${SUBAGENT_COMMANDS}> ...\n`;

const writePageResponse = (page: { readonly success: boolean }): number => {
	writeJson(page);
	if (page.success) {
		return 0;
	}
	return failCli();
};

const toReportResponse = (submission: LedgerSubmission): ReportResponse => {
	if (submission.kind === "submitted" && submission.location !== undefined) {
		return {
			success: true,
			kind: submission.kind,
			headCommit: submission.ledger.headCommit,
			rowCount: submission.ledger.rows.length,
			location: submission.location,
		};
	}
	return {
		success: true,
		kind: submission.kind,
		headCommit: submission.ledger.headCommit,
		rowCount: submission.ledger.rows.length,
	};
};

const dispatchSubAgentAction = async (
	sub: SubAgentCliTarget,
	adapters: HostAdapterPort,
	cmd: Exclude<
		z.infer<typeof SubAgentCommandSchema>,
		{ readonly command: "define" }
	>,
): Promise<number> => {
	if (cmd.command === "ack") {
		writeJson(sub.ack().response);
		return 0;
	}
	if (cmd.command === "rules") {
		return writePageResponse(sub.rulesPage(cmd.page));
	}
	if (cmd.command === "next") {
		return writePageResponse(sub.next());
	}
	if (cmd.command === "prev") {
		return writePageResponse(sub.prev());
	}
	if (cmd.command === "ruleset") {
		return writePageResponse(sub.ruleset(cmd.url, cmd.page));
	}
	const reported = await sub.submitReport(
		cmd.report.oneRowPerRuleInOrder,
		adapters,
	);
	if (!reported.success) {
		return failWithJsonError(z.prettifyError(reported.error));
	}
	writeJson(toReportResponse(reported.data));
	return 0;
};

async function runSubAgentCli(
	deps: SubAgentCliDeps,
	args: readonly string[],
): Promise<number> {
	const dispatchedCli = parseSchemaCli(args, {
		schema: SubAgentCommandSchema,
		toRaw: toRawSubAgentCommand,
		missingCommandUsage: MISSING_COMMAND_USAGE,
		onInvalidCommand: (_command, details) => failWithJsonError(details),
	});
	if (dispatchedCli.kind === "done") {
		return dispatchedCli.exitCode;
	}
	const cmd = dispatchedCli.command;
	if (cmd.command === "define") {
		const looked = deps.resolveDefinition(cmd.term, cmd.depth);
		if (!looked.success) {
			return failWithJsonError(looked.error);
		}
		writeJson(looked.data);
		return 0;
	}
	const parsedWorkdir = deps.workspaceFactory.fromSession(cmd.session);
	if (!parsedWorkdir.success) {
		return failWithJsonError(z.prettifyError(parsedWorkdir.error));
	}
	return await dispatchSubAgentAction(
		deps.forSession(cmd.session, cmd.probe),
		deps.adapters,
		cmd,
	);
}

export { runSubAgentCli };
