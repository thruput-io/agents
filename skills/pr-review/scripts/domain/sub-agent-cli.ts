import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { CodeUnderReview } from "./code-under-review.ts";
import {
	type AckResponse,
	type AckStatus,
	type AgentInstructions,
	type Change,
	type Checkout,
	DeadlineMsSchema,
	type Rulebook as ExternalRulebook,
	type ReportResponse,
	type Row,
	SubAgentCommandSchema,
} from "./contracts.g.ts";
import type { Instructions } from "./instructions.ts";
import { isNullOrEmpty } from "./nullish.ts";
import type { Rulebook } from "./rulebook.ts";
import type { LedgerSubmission } from "./sub-agent-ledger.ts";
import { Workdir } from "./workdir.ts";

export type { AckStatus } from "./contracts.g.ts";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SUB_AGENT_CONTROLLER_PATH = resolve(
	SCRIPT_DIR,
	"sub-agent-controller.ts",
);
const REVIEW_SCHEMAS_DIR = resolve(SCRIPT_DIR, "../../../../schemas/review");

export const SUBAGENT_DEADLINE_MS = DeadlineMsSchema.decode(undefined);

export const bootstrapPrompt = (session: string, probeName: string): string =>
	`Run node ${SUB_AGENT_CONTROLLER_PATH} inspect ${session} ${probeName} and node ${SUB_AGENT_CONTROLLER_PATH} ack ${session} ${probeName} with this exact message as argument, message dispatcher on ack, then follow inspect output only.`;

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
	ack: () => AckStatus;
	report: (rows: readonly Row[]) => z.ZodSafeParseResult<LedgerSubmission>;
}

const writeJson = (payload: object): void => {
	process.stdout.write(`${JSON.stringify(payload)}\n`);
};

const failCli = (message?: string): number => {
	if (!isNullOrEmpty(message)) {
		process.stderr.write(message);
	}
	process.exitCode = 1;
	return 1;
};

const readReportInput = (arg: string): unknown => {
	const raw =
		arg.trimStart().startsWith("{") || !existsSync(arg)
			? arg
			: readFileSync(arg, "utf-8");
	return JSON.parse(raw) as unknown;
};

export const subAgentHelpPayload = () => {
	const subAgentSchema = JSON.parse(
		readFileSync(
			resolve(REVIEW_SCHEMAS_DIR, "sub-agent-controller.schema.json"),
			"utf8",
		),
	) as { readonly $defs: { readonly ProbeReport: unknown } };
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
			"node sub-agent-controller.ts inspect <session> <probe>",
			'node sub-agent-controller.ts ack <session> <probe> "<dispatcher-message>"',
			"node sub-agent-controller.ts report <session> <probe> '{\"oneRowPerRuleInOrder\":[...]}'",
		],
		deadlineMs: SUBAGENT_DEADLINE_MS,
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

const toRawSubAgentCommand = (args: readonly string[]): unknown => {
	const [command, session, probe, fourthArg] = args;
	if (command === "inspect") {
		return { command, session, probe };
	}
	if (command === "ack") {
		return { command, session, probe, message: fourthArg };
	}
	if (command === "report") {
		return {
			command,
			session,
			probe,
			report: isNullOrEmpty(fourthArg) ? undefined : readReportInput(fourthArg),
		};
	}
	return { command };
};

export function runSubAgentCli(
	forSession: (session: Checkout, name: Checkout) => SubAgentCliTarget,
	args: readonly string[],
): number {
	const [command, rawSession, probeName] = args;
	if (command === "-h" || command === "--help") {
		writeJson(subAgentHelpPayload());
		return 0;
	}
	if (
		isNullOrEmpty(command) ||
		isNullOrEmpty(rawSession) ||
		isNullOrEmpty(probeName)
	) {
		return failCli(
			"Usage: node sub-agent-controller.ts <inspect|ack|report> <session> <probe> [<rows-json-or-file>]\n",
		);
	}
	if (command !== "inspect" && command !== "ack" && command !== "report") {
		return failCli(`Unsupported command: ${command}\n`);
	}
	const parsedWorkdir = Workdir.fromSession(rawSession);
	if (!parsedWorkdir.success) {
		const errorResponse: AckResponse = {
			success: false,
			error: z.prettifyError(parsedWorkdir.error),
		};
		writeJson(errorResponse);
		return failCli();
	}
	const parsedCommand = SubAgentCommandSchema.safeParse(
		toRawSubAgentCommand(args),
	);
	if (!parsedCommand.success) {
		const errorResponse: ReportResponse = {
			success: false,
			error: z.prettifyError(parsedCommand.error),
		};
		writeJson(errorResponse);
		return failCli();
	}
	const cmd = parsedCommand.data;
	const sub = forSession(cmd.session, cmd.probe);
	if (cmd.command === "inspect") {
		writeJson(sub.inspect());
		return 0;
	}
	if (cmd.command === "ack") {
		const expectedPrompt = bootstrapPrompt(cmd.session, cmd.probe);
		if (cmd.message.trim() !== expectedPrompt) {
			const errorResponse: AckResponse = {
				success: false,
				error: `Dispatcher message does not match the canonical bootstrap prompt for ${cmd.probe}. Do not pass custom instructions to subagents.`,
			};
			writeJson(errorResponse);
			return failCli();
		}
		const ack = sub.ack();
		const response: AckResponse = {
			success: true,
			probe: cmd.probe,
			acknowledged: true,
			deadlineMs: ack.deadlineMs,
			permissions: [...ack.permissions],
		};
		writeJson(response);
		return 0;
	}
	const reported = sub.report(cmd.report.oneRowPerRuleInOrder);
	if (!reported.success) {
		const errorResponse: ReportResponse = {
			success: false,
			error: z.prettifyError(reported.error),
		};
		writeJson(errorResponse);
		return failCli();
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
