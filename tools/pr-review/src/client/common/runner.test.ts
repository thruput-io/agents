import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import type { Answer } from "../../perimeters/answer.ts";
import { type Commands, run } from "./runner.ts";

const commands: Commands = {
	answering: (): Effect.Effect<Answer, Answer> =>
		Effect.succeed({ rules: ["yes"] }),
	refusing: (): Effect.Effect<Answer, Answer> =>
		Effect.fail({ failure: "refused" }),
	echoing: (
		commandArguments: readonly string[],
	): Effect.Effect<Answer, Answer> =>
		Effect.succeed({ rules: [commandArguments.join(" ")] }),
};

it("an answer is printed as JSON with exit code 0", () => {
	assert.deepEqual(Effect.runSync(run(commands, ["answering"])), {
		line: '{"rules":["yes"]}\n',
		exitCode: 0,
	});
});

it("a failure is printed as JSON with exit code 1", () => {
	assert.deepEqual(Effect.runSync(run(commands, ["refusing"])), {
		line: '{"failure":"refused"}\n',
		exitCode: 1,
	});
});

it("a command is handed the arguments after its name", () => {
	assert.deepEqual(Effect.runSync(run(commands, ["echoing", "one", "two"])), {
		line: '{"rules":["one two"]}\n',
		exitCode: 0,
	});
});

it("a name that is no command is answered as not valid", () => {
	assert.deepEqual(Effect.runSync(run(commands, ["other"])), {
		line: '{"failure":"not-valid"}\n',
		exitCode: 1,
	});
});

it("an empty command line is answered as not valid", () => {
	assert.deepEqual(Effect.runSync(run(commands, [])), {
		line: '{"failure":"not-valid"}\n',
		exitCode: 1,
	});
});
