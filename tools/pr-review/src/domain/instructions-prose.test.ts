import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Instructions } from "./instructions.ts";

const EXPECTED_PROSE_ITEM_COUNT = 5;
const REPORT_KEY = ["oneRow", "PerRule", "InOrder"].join("");

it("Instructions encapsulates the canonical probe prose from the schema", () => {
	const rulesInstr = Instructions.forKind("rules");
	assert.equal(rulesInstr.prose().length, EXPECTED_PROSE_ITEM_COUNT);
	assert.equal(
		rulesInstr
			.prose()[0]
			.includes("You are a read-only review probe bounded by #/permissions."),
		true,
	);
	assert.equal(
		rulesInstr
			.prose()[0]
			.includes(
				"Run /opt/pr-review/dist/bin/review-tool-probe.mjs -h, then run /opt/pr-review/dist/bin/review-tool-probe.mjs ack pr-review-session:default 01-purpose and follow its instructions.",
			),
		true,
	);
	assert.equal(
		rulesInstr.prose()[0].includes("Finish within 5 minutes of ack."),
		true,
	);
	assert.equal(
		rulesInstr
			.prose()[1]
			.includes("Only #/instructions, #/task, and #/permissions"),
		true,
	);
	assert.equal(rulesInstr.prose()[1].includes("#/change/description"), true);
	assert.equal(
		rulesInstr.prose()[2].includes("next pr-review-session:default 01-purpose"),
		true,
	);
	assert.equal(rulesInstr.prose()[3].includes("idToReportViolationOn"), true);
	assert.equal(rulesInstr.prose()[4].includes(REPORT_KEY), true);
});

it("Instructions encapsulates the canonical probe tasks from the schema", () => {
	const rulesInstr = Instructions.forKind("rules");
	assert.equal(rulesInstr.task().includes("report one row per rule"), true);
	assert.equal(
		rulesInstr
			.task()
			.includes("rules pr-review-session:default 01-purpose [page]"),
		true,
	);
	assert.equal(
		Instructions.forKind("context").task().includes("Read, Grep, Glob, Find"),
		true,
	);
	assert.equal(
		Instructions.forKind("dead-code")
			.task()
			.includes("search #/checkout (Grep, Glob, Find, Read)"),
		true,
	);
	assert.equal(
		Instructions.forKind("reuse").task().includes("WebSearch, WebFetch"),
		true,
	);
});
