import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import {
	agent,
	host,
	storeWithReview,
} from "../../controller/common/stand-in.test-support.ts";
import { type Commands, run } from "../common/runner.ts";
import { subTool } from "./sub-commands.ts";

const sentence =
	"By sending this ack I acknowledge I read all instructions and implicitly I know how to use the review tool";
const fourEmptyParts =
	'{"workflow":{},"context":{},"usage":{},"request":"a request"}\n';

const tool = (): Commands => subTool(host, storeWithReview(), agent);

const answerTo = (commands: Commands, line: readonly string[]): string =>
	Effect.runSync(run(commands, line)).line;

it("instructions answers the four parts of the instructions", () => {
	assert.equal(answerTo(tool(), ["instructions", "probe-1"]), fourEmptyParts);
});

it("rules before an acknowledgement is refused", () => {
	assert.deepEqual(Effect.runSync(run(tool(), ["rules", "probe-1"])), {
		line: '{"failure":"not-acknowledged"}\n',
		exitCode: 1,
	});
});

it("ack with the sentence answers every rule as left", () => {
	assert.deepEqual(Effect.runSync(run(tool(), ["ack", "probe-1", sentence])), {
		line: '{"remaining":["Stated purpose","Delete unused"]}\n',
		exitCode: 0,
	});
});

it("ack with other text answers the detailed instructions", () => {
	assert.deepEqual(
		Effect.runSync(run(tool(), ["ack", "probe-1", "I read it"])),
		{
			line: fourEmptyParts,
			exitCode: 1,
		},
	);
});

it("an acknowledged sub agent reads its rules, pages and definitions", () => {
	const commands: Commands = tool();

	assert.deepEqual(
		[
			answerTo(commands, ["ack", "probe-1", sentence]),
			answerTo(commands, ["rules", "probe-1"]),
			answerTo(commands, ["next", "probe-1"]),
			answerTo(commands, ["next", "probe-1"]),
			answerTo(commands, ["prev", "probe-1"]),
			answerTo(commands, ["define", "probe-1", "'Ledger'"]),
			answerTo(commands, ["define", "probe-1", "Nothing"]),
		],
		[
			'{"remaining":["Stated purpose","Delete unused"]}\n',
			'{"rules":["Stated purpose","Delete unused"]}\n',
			'"a page"\n',
			'{"failure":"no-page"}\n',
			'"a page"\n',
			'"a definition"\n',
			'{"failure":"not-defined"}\n',
		],
	);
});

it("reporting each rule leaves nothing, and another rule is refused", () => {
	const commands: Commands = tool();

	assert.deepEqual(
		[
			answerTo(commands, ["ack", "probe-1", sentence]),
			answerTo(commands, ["report", "probe-1", "Stated purpose"]),
			answerTo(commands, ["report", "probe-1", "Another rule"]),
			answerTo(commands, ["report", "probe-1", "Delete unused"]),
		],
		[
			'{"remaining":["Stated purpose","Delete unused"]}\n',
			'{"remaining":["Delete unused"]}\n',
			'{"failure":"not-assigned"}\n',
			'{"remaining":[]}\n',
		],
	);
});

it("a command without its probe is answered as not valid", () => {
	assert.deepEqual(Effect.runSync(run(tool(), ["rules"])), {
		line: '{"failure":"not-valid"}\n',
		exitCode: 1,
	});
});

it("-h names every command", () => {
	const printed = Effect.runSync(run(tool(), ["-h"]));

	assert.deepEqual(Object.keys(JSON.parse(printed.line).commands), [
		"instructions",
		"ack",
		"rules",
		"define",
		"next",
		"prev",
		"report",
	]);
});
