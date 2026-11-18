#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { HostAdapterFactory } from "../adapters/adapter-factory.ts";
import {
	type AckResult,
	SubAgentController,
} from "../controller/sub-agent-controller.ts";
import type { CodeUnderReview } from "../domain/code-under-review.ts";
import {
	type AckPayload,
	type AckResponse,
	type AgentInstructions,
	type Change,
	type Checkout,
	type Rulebook as ExternalRulebook,
	type PageResponse,
	type ReportResponse,
	type Row,
	type RulesetPageResponse,
	type RulesetUrl,
	SubAgentCommandSchema,
} from "../domain/contracts.g.ts";
import { resolveDefinition } from "../domain/define.ts";
import type { Instructions } from "../domain/instructions.ts";
import { isNullOrEmpty } from "../domain/nullish.ts";
import type { LedgerSubmission } from "../domain/probe-ledger.ts";
import type { Rulebook } from "../domain/rulebook.ts";
import { Workdir } from "../domain/workdir.ts";
import {
	failCli,
	failWithJsonError,
	isCliEntrypoint,
	parseSchemaCli,
	type RawCommandResult,
	writeJson,
} from "./cli.ts";
import { subAgentHelpPayload } from "./sub-agent-help.ts";

type ProbeRules =
	| { readonly kind: "rulebook"; readonly rulebook: Rulebook }
	| {
			readonly kind: "rulesets";
			readonly rulesets: readonly ExternalRulebook[];
	  };

interface SubAgentCliTarget {
	workdir: () => Workdir;
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

const ACK_FAILURE_GUIDE =
	'Provide valid JSON for ack: Rules/Reuse/DeadCode -> {"message":"<dispatcher message received>","rulesInOrder":[<rule ids from #/ruleset/rules in order>],"observationFormat":"<observation> breaks <principle>"}; Context -> {"message":"<dispatcher message received>","bookRuleRows":3,"observationFormat":"<observation> breaks <principle>"}.';

const readJsonInput = (
	arg: string,
):
	| { readonly ok: true; readonly value: unknown }
	| { readonly ok: false; readonly error: string } => {
	try {
		let raw = arg;
		if (!arg.trimStart().startsWith("{") && existsSync(arg)) {
			raw = readFileSync(arg, "utf-8");
		}
		return { ok: true, value: JSON.parse(raw) as unknown };
	} catch (error) {
		if (error instanceof Error) {
			return { ok: false, error: error.message };
		}
		return { ok: false, error: String(error) };
	}
};

const parseIntegerArg = (
	raw: string | undefined,
	fallback: number,
): number | typeof raw => {
	if (isNullOrEmpty(raw)) {
		return fallback;
	}
	const parsed = Number(raw);
	if (Number.isInteger(parsed)) {
		return parsed;
	}
	return raw;
};

const toAckCommand = (
	session: string | undefined,
	probe: string | undefined,
	thirdArg: string | undefined,
): RawCommandResult => {
	if (isNullOrEmpty(thirdArg)) {
		return {
			ok: false,
			error: `Missing ack JSON payload. ${ACK_FAILURE_GUIDE}`,
		};
	}
	const parsedJson = readJsonInput(thirdArg);
	if (!parsedJson.ok) {
		return {
			ok: false,
			error: `Malformed JSON for ack: ${parsedJson.error}. ${ACK_FAILURE_GUIDE}`,
		};
	}
	return {
		ok: true,
		raw: { command: "ack", session, probe, payload: parsedJson.value },
	};
};

const toReportCommand = (
	session: string | undefined,
	probe: string | undefined,
	thirdArg: string | undefined,
): RawCommandResult => {
	if (isNullOrEmpty(thirdArg)) {
		return { ok: true, raw: { command: "report", session, probe } };
	}
	const parsedJson = readJsonInput(thirdArg);
	if (!parsedJson.ok) {
		return {
			ok: false,
			error: `Malformed JSON for report: ${parsedJson.error}`,
		};
	}
	return {
		ok: true,
		raw: { command: "report", session, probe, report: parsedJson.value },
	};
};

const toRawSubAgentCommand = (args: readonly string[]): RawCommandResult => {
	const [command, firstArg, secondArg, thirdArg, fourthArg] = args;
	if (command === "define") {
		return {
			ok: true,
			raw: {
				command,
				term: firstArg,
				depth: parseIntegerArg(secondArg, 1),
			},
		};
	}
	if (command === "inspect" || command === "next" || command === "prev") {
		return { ok: true, raw: { command, session: firstArg, probe: secondArg } };
	}
	if (command === "ruleset") {
		return {
			ok: true,
			raw: {
				command,
				session: firstArg,
				probe: secondArg,
				url: thirdArg,
				page: parseIntegerArg(fourthArg, 1),
			},
		};
	}
	if (command === "ack") {
		return toAckCommand(firstArg, secondArg, thirdArg);
	}
	if (command === "report") {
		return toReportCommand(firstArg, secondArg, thirdArg);
	}
	return { ok: true, raw: { command } };
};

const runDefineCli = (term: string, depth: number): number => {
	const looked = resolveDefinition(term, depth);
	if (!looked.success) {
		return failWithJsonError(looked.error);
	}
	writeJson(looked.data);
	return 0;
};

const writePageResponse = (page: { readonly success: boolean }): number => {
	writeJson(page);
	if (page.success) {
		return 0;
	}
	return failCli();
};

const MISSING_COMMAND_USAGE = [
	"Usage: review-tool-probe <define|inspect|ack|",
	"next|prev|ruleset|report> ...\n",
].join("");

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
	forSession: (session: Checkout, name: Checkout) => SubAgentCliTarget,
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
		return runDefineCli(cmd.term, cmd.depth);
	}
	const parsedWorkdir = Workdir.fromSession(cmd.session);
	if (!parsedWorkdir.success) {
		return failWithJsonError(z.prettifyError(parsedWorkdir.error));
	}
	return dispatchSubAgentAction(forSession(cmd.session, cmd.probe), cmd);
}

if (import.meta.main || isCliEntrypoint(import.meta.url)) {
	runSubAgentCli(
		(session, name) =>
			SubAgentController.forSession(session, name, HostAdapterFactory),
		process.argv.slice(2),
	);
}

export type { SubAgentCliTarget };
export { runSubAgentCli };
