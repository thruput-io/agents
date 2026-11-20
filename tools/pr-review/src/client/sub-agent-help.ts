import { SUBAGENT_DEADLINE_MS } from "../controller/sub-agent-controller.ts";
import {
	HELP_ACK_SCHEMA,
	HELP_REPORT_SCHEMA,
	HELP_ROW_SCHEMAS,
} from "../domain/contracts.g.ts";

const subAgentHelpPayload = () => {
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
		ackSchema: HELP_ACK_SCHEMA,
		reportSchema: HELP_REPORT_SCHEMA,
		rowSchemas: HELP_ROW_SCHEMAS,
	};
};

export { subAgentHelpPayload };
