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
import type { Instructions } from "../domain/instructions.ts";
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
import { subAgentHelpPayload } from "./sub-agent-help.ts";

interface SubAgentCliTarget {
	workdir: () => WorkspacePort;
	instructions: () => Instructions;
	change: () => Change;
	codeUnderReview: () => CodeUnderReview;
	rules: () => ProbeRules;
	rulesPage: (page: number) => RulesPageResponse;
	next: () => PageResponse;
	prev: () => PageResponse;
	ruleset: (url: RulesetUrl, page: number) => RulesetPageResponse;
	ack: () => AckResult;
	report: (rows: readonly Row[]) => z.ZodSafeParseResult<LedgerSubmission>;
}

interface SubAgentCliDeps {
	readonly workspaceFactory: WorkspaceFactoryPort;
	readonly forSession: (session: Checkout, name: Checkout) => SubAgentCliTarget;
	readonly resolveDefinition: (
		term: string,
		depth: number,
	) => DefineLookupResult;
}

const MISSING_COMMAND_USAGE = [
	"Usage: review-tool-probe.mjs <define|ack|rules|",
	"next|prev|ruleset|report> ...\n",
].join("");

const writePageResponse = (page: { readonly success: boolean }): number => {
	writeJson(page);
	if (page.success) {
		return 0;
	}
	return failCli();
};

const dispatchSubAgentAction = (
	sub: SubAgentCliTarget,
	cmd: Exclude<
		z.infer<typeof SubAgentCommandSchema>,
		{ readonly command: "define" }
	>,
): number => {
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
	const reported = sub.report(cmd.report.oneRowPerRuleInOrder);
	if (!reported.success) {
		return failWithJsonError(z.prettifyError(reported.error));
	}
	const response: ReportResponse = {
		success: true,
		kind: reported.data.kind,
		headCommit: reported.data.ledger.headCommit,
		rowCount: reported.data.ledger.rows.length,
	};
	writeJson(response);
	return 0;
};

function runSubAgentCli(
	deps: SubAgentCliDeps,
	args: readonly string[],
): number {
	const dispatchedCli = parseSchemaCli(args, {
		schema: SubAgentCommandSchema,
		help: subAgentHelpPayload,
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
	return dispatchSubAgentAction(deps.forSession(cmd.session, cmd.probe), cmd);
}

export { runSubAgentCli };
