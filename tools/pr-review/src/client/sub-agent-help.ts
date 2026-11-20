import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SUBAGENT_DEADLINE_MS } from "../controller/sub-agent-controller.ts";

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
			"review-tool-probe.mjs -h | --help",
			"review-tool-probe.mjs ack <session> <probe>",
			"review-tool-probe.mjs rules <session> <probe> [page]",
			"review-tool-probe.mjs next <session> <probe>",
			"review-tool-probe.mjs prev <session> <probe>",
			'review-tool-probe.mjs ruleset <session> <probe> "<url>" [page]',
			'review-tool-probe.mjs define "<term>" [depth]',
			`review-tool-probe.mjs report <session> <probe> ${reportJson}`,
		],
		deadlineMs: SUBAGENT_DEADLINE_MS,
		ackSchema: subAgentDefs.get("AckSuccess"),
		reportSchema: subAgentDefs.get("ProbeReport"),
		rowSchemas: Object.fromEntries(
			ROW_SCHEMA_KEYS.map((key) => [key, ledgerDefs.get(key)]),
		),
	};
};

export { subAgentHelpPayload };
