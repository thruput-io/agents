import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Instructions } from "./instructions.ts";

const EXPECTED_PROSE_ITEM_COUNT = 5;

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
				"review-tool-probe.mjs ack <session> <probe> and follow its instructions.",
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
	assert.equal(rulesInstr.prose()[2].includes("paging through next"), true);
	assert.equal(
		rulesInstr.prose()[3].includes("schema definitions returned by -h"),
		true,
	);
	assert.equal(
		rulesInstr.prose()[4].includes("Submit one row per rule in order"),
		true,
	);
});

it("Instructions encapsulates the canonical probe tasks from the schema", () => {
	const rulesInstr = Instructions.forKind("rules");
	assert.equal(rulesInstr.task().includes("report one row per rule"), true);
	assert.equal(
		rulesInstr.task().includes("Fetch your assigned rules via rules"),
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
