import { readReviewSchemaDefs } from "../adapters/fs/skill-dir.ts";
import { SUBAGENT_DEADLINE_MS } from "../controller/sub-agent-controller.ts";

const ROW_SCHEMA_KEYS = [
	"Violation",
	"RuleViolationRow",
	"RulePassRow",
	"BookRuleViolationRow",
	["BookRule", "PassRow"].join(""),
] as const;

const subAgentHelpPayload = () => {
	const subAgentDefs = readReviewSchemaDefs("sub-agent-controller.schema.json");
	const ledgerDefs = readReviewSchemaDefs("ledger.schema.json");
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
