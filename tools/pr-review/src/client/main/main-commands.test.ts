import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import {
	agent,
	emptyStore,
	host,
} from "../../controller/common/stand-in.test-support.ts";
import { type Commands, run } from "../common/runner.ts";
import { mainTool } from "./main-commands.ts";

const tool = (): Commands => mainTool(host, emptyStore(), agent);

it("prepare answers how the new review stands", () => {
	const printed = Effect.runSync(
		run(tool(), ["prepare", "https://host.test/change", "/work"]),
	);

	assert.deepEqual(printed, {
		line: '{"remaining":[],"posted":false,"postFailed":false}\n',
		exitCode: 0,
	});
});

it("prepare without a workdir is answered as not valid", () => {
	const printed = Effect.runSync(
		run(tool(), ["prepare", "https://host.test/change"]),
	);

	assert.deepEqual(printed, {
		line: '{"failure":"not-valid"}\n',
		exitCode: 1,
	});
});

it("status of a workdir without a review is answered as no review", () => {
	assert.deepEqual(Effect.runSync(run(tool(), ["status", "/work"])), {
		line: '{"failure":"no-review"}\n',
		exitCode: 1,
	});
});

it("status after prepare answers how the review stands", () => {
	const commands: Commands = tool();

	Effect.runSync(
		run(commands, ["prepare", "https://host.test/change", "/work"]),
	);

	assert.deepEqual(Effect.runSync(run(commands, ["status", "/work"])), {
		line: '{"remaining":[],"posted":false,"postFailed":false}\n',
		exitCode: 0,
	});
});

it("-h names every command", () => {
	const printed = Effect.runSync(run(tool(), ["-h"]));

	assert.deepEqual(Object.keys(JSON.parse(printed.line).commands), [
		"prepare",
		"status",
	]);
});
