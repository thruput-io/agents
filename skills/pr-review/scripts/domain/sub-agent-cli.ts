import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import type { CodeUnderReview } from "./code-under-review.ts";
import {
	type Change,
	type Checkout,
	type Rulebook as ExternalRulebook,
	type Row,
	RowSchema,
} from "./contracts.g.ts";
import type { Instructions } from "./instructions.ts";
import { isNullOrEmpty } from "./nullish.ts";
import type { Rulebook } from "./rulebook.ts";
import type { LedgerSubmission } from "./sub-agent-ledger.ts";
import { Workdir } from "./workdir.ts";

export const SUBAGENT_DEADLINE_MS = 300_000;

export interface AckStatus {
	readonly acknowledgedAt: number;
	readonly deadlineMs: number;
	readonly permissions: readonly string[];
}

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
	ack: () => AckStatus;
	report: (rows: readonly Row[]) => z.ZodSafeParseResult<LedgerSubmission>;
}

const writeJson = (payload: object): void => {
	process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
};

const failCli = (message?: string): number => {
	if (!isNullOrEmpty(message)) {
		process.stderr.write(message);
	}
	process.exitCode = 1;
	return 1;
};

const readRowsInput = (arg: string): string =>
	arg.trimStart().startsWith("[") || !existsSync(arg)
		? arg
		: readFileSync(arg, "utf-8");

export const subAgentHelpPayload = () => ({
	usage: [
		"node sub-agent-controller.ts -h | --help",
		"node sub-agent-controller.ts inspect <session> <probe>",
		"node sub-agent-controller.ts ack <session> <probe>",
		"node sub-agent-controller.ts report <session> <probe> '<rows-json>'",
	],
	deadlineMs: SUBAGENT_DEADLINE_MS,
	rowSchemas: {
		cleanOrNotApplicableRuleRow: {
			rule: "<rule-id>",
			examined: ["<path-or-artifact>"],
			verdict: "clean | not-applicable",
			evidence: "<why>",
		},
		violationRuleRow: {
			rule: "<rule-id>",
			examined: ["<path-or-artifact>"],
			verdict: "violation",
			evidence: "<why>",
			violations: [
				{
					observation:
						"<what the code does wrong, completing '<observation> breaks <principle>'>",
					anchor: {
						kind: "surface",
						path: "<file-path>",
						side: "head | base",
						lines: [{ idToReportViolationOn: 1, text: "<exact line text>" }],
					},
				},
			],
		},
		bookRuleRow: {
			bookRule: { ruleset: "<ruleset-url>", heading: "<heading>" },
			examined: ["<path-or-artifact>"],
			verdict: "clean | not-applicable | violation",
			evidence: "<why>",
		},
		pullRequestAnchor: {
			kind: "pull-request",
		},
	},
});

export function runSubAgentCli(
	forSession: (session: Checkout, name: Checkout) => SubAgentCliTarget,
	args: readonly string[],
): number {
	const [command, rawSession, probeName, rawRows] = args;
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
	const parsedWorkdir = Workdir.fromSession(rawSession);
	if (!parsedWorkdir.success) {
		writeJson({
			success: false,
			error: z.prettifyError(parsedWorkdir.error),
		});
		return failCli();
	}
	const sub = forSession(rawSession, probeName);
	if (command === "inspect") {
		const rules = sub.rules();
		writeJson({
			probe: probeName,
			permissions: sub.instructions().permissions(),
			instructions: sub.instructions().prose(),
			task: sub.instructions().task(),
			change: sub.change(),
			surface: sub.codeUnderReview().surface(),
			rules:
				rules.kind === "rulebook"
					? { kind: "rulebook", ruleset: rules.rulebook.toRuleset() }
					: rules,
			snapshotDirectory: sub.workdir().snapshotDirectory().toString(),
		});
		return 0;
	}
	if (command === "ack") {
		const ack = sub.ack();
		writeJson({
			success: true,
			probe: probeName,
			acknowledged: true,
			deadlineMs: ack.deadlineMs,
			permissions: ack.permissions,
		});
		return 0;
	}
	if (command === "report") {
		if (isNullOrEmpty(rawRows)) {
			writeJson({
				success: false,
				error: "Missing rows JSON argument or file path",
			});
			return failCli();
		}
		const parsedRows = z
			.array(RowSchema)
			.safeParse(JSON.parse(readRowsInput(rawRows)));
		if (!parsedRows.success) {
			writeJson({
				success: false,
				error: z.prettifyError(parsedRows.error),
			});
			return failCli();
		}
		const reported = sub.report(parsedRows.data);
		if (!reported.success) {
			writeJson({
				success: false,
				error: z.prettifyError(reported.error),
			});
			return failCli();
		}
		writeJson({
			success: true,
			kind: reported.data.kind,
			headCommit: reported.data.ledger.headCommit,
			rowCount: reported.data.ledger.rows.length,
		});
		return 0;
	}
	return failCli(`Unsupported command: ${command}\n`);
}
