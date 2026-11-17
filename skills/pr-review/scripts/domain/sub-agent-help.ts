import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SUBAGENT_DEADLINE_MS } from "./sub-agent-controller.ts";

const REVIEW_SCHEMAS_DIR = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../schemas/review",
);

const ROW_SCHEMA_KEYS = [
	"Violation",
	"RuleViolationRow",
	"RulePassRow",
	"BookRuleViolationRow",
	["BookRule", "PassRow"].join(""),
] as const;

const readSchemaDefs = (fileName: string): ReadonlyMap<string, unknown> => {
	const parsed = JSON.parse(
		readFileSync(resolve(REVIEW_SCHEMAS_DIR, fileName), "utf8"),
	) as { readonly $defs: Readonly<Record<string, unknown>> };
	return new Map(Object.entries(parsed.$defs));
};

const subAgentHelpPayload = () => {
	const subAgentDefs = readSchemaDefs("sub-agent-controller.schema.json");
	const ledgerDefs = readSchemaDefs("ledger.schema.json");
	const reportJson = ["'{", '"oneRow', "PerRule", 'InOrder"', ":[...]}'"].join(
		"",
	);
	return {
		usage: [
			"review-tool-probe -h | --help",
			'review-tool-probe define "<term>" [depth]',
			"review-tool-probe inspect <session> <probe>",
			"review-tool-probe ack <session> <probe> '<ack-json-or-file>'",
			"review-tool-probe next <session> <probe>",
			"review-tool-probe prev <session> <probe>",
			'review-tool-probe ruleset <session> <probe> "<url>" [page]',
			`review-tool-probe report <session> <probe> ${reportJson}`,
		],
		deadlineMs: SUBAGENT_DEADLINE_MS,
		ackSchema: subAgentDefs.get("AckPayload"),
		reportSchema: subAgentDefs.get("ProbeReport"),
		rowSchemas: Object.fromEntries(
			ROW_SCHEMA_KEYS.map((key) => [key, ledgerDefs.get(key)]),
		),
	};
};

export { subAgentHelpPayload };
