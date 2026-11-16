import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
	failCli,
	failWithJsonError,
	parseSchemaCli,
	type RawCommandResult,
	writeJson,
} from "./cli.ts";
import type { CodeUnderReview } from "./code-under-review.ts";
import {
	type AckPayload,
	type AckResponse,
	type AckStatus,
	type AgentInstructions,
	type Change,
	type Checkout,
	DeadlineMsSchema,
	type Rulebook as ExternalRulebook,
	type PageResponse,
	type ReportResponse,
	type Row,
	type RulesetPageResponse,
	type RulesetUrl,
	SubAgentCommandSchema,
} from "./contracts.g.ts";
import { resolveDefinition } from "./define.ts";
import type { Instructions } from "./instructions.ts";
import { isNullOrEmpty } from "./nullish.ts";
import type { Rulebook } from "./rulebook.ts";
import type { LedgerSubmission } from "./sub-agent-ledger.ts";
import { Workdir } from "./workdir.ts";

export type AckResult =
	| { readonly success: true; readonly data: AckStatus }
	| { readonly success: false; readonly error: string };

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REVIEW_SCHEMAS_DIR = resolve(SCRIPT_DIR, "../../../../schemas/review");

export const SUBAGENT_DEADLINE_MS = DeadlineMsSchema.decode(undefined);

type ProbeRules =
	| { readonly kind: "rulebook"; readonly rulebook: Rulebook }
	| {
			readonly kind: "rulesets";
			readonly rulesets: readonly ExternalRulebook[];
	  };

export interface SubAgentCliTarget {
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
		const raw =
			arg.trimStart().startsWith("{") || !existsSync(arg)
				? arg
				: readFileSync(arg, "utf-8");
		return { ok: true, value: JSON.parse(raw) as unknown };
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
};

const subAgentHelpPayload = () => {
	const subAgentSchema = JSON.parse(
		readFileSync(
			resolve(REVIEW_SCHEMAS_DIR, "sub-agent-controller.schema.json"),
			"utf8",
		),
	) as {
		readonly $defs: {
			readonly AckPayload: unknown;
			readonly ProbeReport: unknown;
		};
	};
	const ledgerSchema = JSON.parse(
		readFileSync(resolve(REVIEW_SCHEMAS_DIR, "ledger.schema.json"), "utf8"),
	) as {
		readonly $defs: {
			readonly Violation: unknown;
			readonly RuleViolationRow: unknown;
			readonly RulePassRow: unknown;
			readonly BookRuleViolationRow: unknown;
			readonly BookRulePassRow: unknown;
		};
	};
	return {
		usage: [
			"node sub-agent-controller.ts -h | --help",
			'node sub-agent-controller.ts define "<term>" [depth]',
			"node sub-agent-controller.ts inspect <session> <probe>",
			"node sub-agent-controller.ts ack <session> <probe> '<ack-json-or-file>'",
			"node sub-agent-controller.ts next <session> <probe>",
			"node sub-agent-controller.ts prev <session> <probe>",
			'node sub-agent-controller.ts ruleset <session> <probe> "<url>" [page]',
			"node sub-agent-controller.ts report <session> <probe> '{\"oneRowPerRuleInOrder\":[...]}'",
		],
		deadlineMs: SUBAGENT_DEADLINE_MS,
		ackSchema: subAgentSchema.$defs.AckPayload,
		reportSchema: subAgentSchema.$defs.ProbeReport,
		rowSchemas: {
			Violation: ledgerSchema.$defs.Violation,
			RuleViolationRow: ledgerSchema.$defs.RuleViolationRow,
			RulePassRow: ledgerSchema.$defs.RulePassRow,
			BookRuleViolationRow: ledgerSchema.$defs.BookRuleViolationRow,
			BookRulePassRow: ledgerSchema.$defs.BookRulePassRow,
		},
	};
};

const parseIntegerArg = (
	raw: string | undefined,
	fallback: number,
): number | typeof raw => {
	if (isNullOrEmpty(raw)) {
		return fallback;
	}
	const parsed = Number(raw);
	return Number.isInteger(parsed) ? parsed : raw;
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
			raw: {
				command,
				session: firstArg,
				probe: secondArg,
				payload: parsedJson.value,
			},
		};
	}
	if (command === "report") {
		if (isNullOrEmpty(thirdArg)) {
			return {
				ok: true,
				raw: { command, session: firstArg, probe: secondArg },
			};
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
			raw: {
				command,
				session: firstArg,
				probe: secondArg,
				report: parsedJson.value,
			},
		};
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

export function runSubAgentCli(
	forSession: (session: Checkout, name: Checkout) => SubAgentCliTarget,
	args: readonly string[],
): number {
	const dispatchedCli = parseSchemaCli(args, {
		schema: SubAgentCommandSchema,
		help: subAgentHelpPayload,
		toRaw: toRawSubAgentCommand,
		missingCommandUsage:
			"Usage: node sub-agent-controller.ts <define|inspect|ack|next|prev|ruleset|report> ...\n",
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
	const sub = forSession(cmd.session, cmd.probe);
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
}
