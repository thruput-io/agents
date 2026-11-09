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
	report: (rows: readonly Row[]) => z.ZodSafeParseResult<LedgerSubmission>;
}

const writeJson = (payload: object): void => {
	process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
};

const readRowsInput = (arg: string): string =>
	arg.trimStart().startsWith("[") || !existsSync(arg)
		? arg
		: readFileSync(arg, "utf-8");

export function runSubAgentCli(
	forWorkdir: (workdir: Workdir, name: Checkout) => SubAgentCliTarget,
	args: readonly string[],
): void {
	const [command, rawWorkdir, probeName, rawRows] = args;
	if (
		isNullOrEmpty(command) ||
		isNullOrEmpty(rawWorkdir) ||
		isNullOrEmpty(probeName)
	) {
		process.stderr.write(
			"Usage: node sub-agent-controller.ts <inspect|report> <workdir> <probe> [<rows-json-or-file>]\n",
		);
		process.exitCode = 1;
		return;
	}
	const parsedWorkdir = Workdir.from(rawWorkdir);
	if (!parsedWorkdir.success) {
		writeJson({
			success: false,
			error: z.prettifyError(parsedWorkdir.error),
		});
		process.exitCode = 1;
		return;
	}
	const sub = forWorkdir(parsedWorkdir.data, probeName);
	if (command === "inspect") {
		const rules = sub.rules();
		writeJson({
			probe: probeName,
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
		return;
	}
	if (command === "report") {
		if (isNullOrEmpty(rawRows)) {
			writeJson({
				success: false,
				error: "Missing rows JSON argument or file path",
			});
			process.exitCode = 1;
			return;
		}
		const parsedRows = z
			.array(RowSchema)
			.safeParse(JSON.parse(readRowsInput(rawRows)));
		if (!parsedRows.success) {
			writeJson({
				success: false,
				error: z.prettifyError(parsedRows.error),
			});
			process.exitCode = 1;
			return;
		}
		const reported = sub.report(parsedRows.data);
		if (!reported.success) {
			writeJson({
				success: false,
				error: z.prettifyError(reported.error),
			});
			process.exitCode = 1;
			return;
		}
		writeJson({
			success: true,
			kind: reported.data.kind,
			headCommit: reported.data.ledger.headCommit,
			rowCount: reported.data.ledger.rows.length,
		});
		return;
	}
	process.stderr.write(`Unsupported command: ${command}\n`);
	process.exitCode = 1;
}
