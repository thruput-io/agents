import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { NoReview } from "../../generated/domain/no-review.g.ts";
import { ReviewStatus } from "../../generated/domain/review-status.g.ts";
import { type Commands, run } from "./runner.ts";

const commands: Commands = {
	answering: () => Effect.succeed(ReviewStatus.create()),
	refusing: () => Effect.fail(NoReview.create()),
	echoing: ([first = ""]) =>
		Effect.succeed({ toJSON: () => ({ kind: first }) }),
};

it("an answer is printed as JSON with exit code 0", () => {
	assert.deepEqual(Effect.runSync(run(commands, ["answering"])), {
		line: '{"kind":"review-status"}\n',
		exitCode: 0,
	});
});

it("a failure is printed as JSON with exit code 1", () => {
	assert.deepEqual(Effect.runSync(run(commands, ["refusing"])), {
		line: '{"kind":"no-review"}\n',
		exitCode: 1,
	});
});

it("a command is handed the arguments after its name", () => {
	assert.deepEqual(Effect.runSync(run(commands, ["echoing", "given"])), {
		line: '{"kind":"given"}\n',
		exitCode: 0,
	});
});

it("a name that is no command is answered as not valid", () => {
	assert.deepEqual(Effect.runSync(run(commands, ["other"])), {
		line: '{"kind":"not-valid"}\n',
		exitCode: 1,
	});
});

it("an empty command line is answered as not valid", () => {
	assert.deepEqual(Effect.runSync(run(commands, [])), {
		line: '{"kind":"not-valid"}\n',
		exitCode: 1,
	});
});
