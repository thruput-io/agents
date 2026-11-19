import { z } from "zod";
import type { AckResult } from "../controller/sub-agent-controller.ts";
import type { ProbeRules } from "../controller/sub-agent-probe.ts";
import type { CodeUnderReview } from "../domain/code-under-review.ts";
import {
	type AckPayload,
	type AckResponse,
	type AgentInstructions,
	type Change,
	type Checkout,
	type PageResponse,
	type ReportResponse,
	type Row,
	type RulesetPageResponse,
	type RulesetUrl,
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
import { ACK_FAILURE_GUIDE, toRawSubAgentCommand } from "./sub-agent-args.ts";
import { subAgentHelpPayload } from "./sub-agent-help.ts";

interface SubAgentCliTarget {
	workdir: () => WorkspacePort;
	instructions: () => Instructions;
	change: () => Change;
	codeUnderReview: () => CodeUnderReview;
	rules: () => ProbeRules;
	inspect: () => AgentInstructions;
	next: () => PageResponse;
	prev: () => PageResponse;
	ruleset: (url: RulesetUrl, page: number) => RulesetPageResponse;
	ack: (payload: AckPayload) => AckResult;
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
	"Usage: review-tool-probe.mjs <define|inspect|ack|",
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
	if (cmd.command === "inspect") {
		writeJson(sub.inspect());
		return 0;
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
	if (cmd.command === "ack") {
		const acked = sub.ack(cmd.payload);
		if (!acked.success) {
			return failWithJsonError(acked.error);
		}
		const response: AckResponse = {
			success: true,
			probe: cmd.probe,
			acknowledged: true,
			deadlineMs: acked.data.deadlineMs,
			permissions: [...acked.data.permissions],
		};
		writeJson(response);
		return 0;
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
		onInvalidCommand: (command, details) => {
			if (command === "ack") {
				return failWithJsonError(`${details}\n${ACK_FAILURE_GUIDE}`);
			}
			return failWithJsonError(details);
		},
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
