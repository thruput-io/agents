import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { MainController } from "../../controller/main/main-controller.ts";
import type { Agent } from "../../domain/agent.ts";
import { Assignment } from "../../domain/assignment.ts";
import { Change } from "../../domain/change.ts";
import type { Host } from "../../domain/host.ts";
import { PendingReview } from "../../domain/pending-review.ts";
import type { ReviewStore } from "../../domain/review.ts";
import { Outcome } from "../../generated/domain/outcome.g.ts";
import { run } from "../common/runner.ts";
import { mainCommands } from "./main-commands.ts";

const host: Host = {
	getChange: () => Effect.succeed(Change.create()),
	post: () => Effect.succeed(Outcome.create()),
};

const store: ReviewStore = {
	save: (_workdir, review) => Effect.succeed(review),
	inWorkdir: () => Effect.succeed(PendingReview.create()),
	ofProbe: () => Effect.succeed(Assignment.create()),
	append: () => Effect.succeed(PendingReview.create()),
};

const agent: Agent = {
	spawn: (assignment) => Effect.succeed(assignment),
	terminate: (assignment) => Effect.succeed(assignment),
};

const commands = mainCommands(MainController.over(host, store, agent));

it("prepare answers the review status", () => {
	const printed = Effect.runSync(
		run(commands, ["prepare", "https://host.test/change", "/work"]),
	);

	assert.deepEqual(printed, {
		line: '{"kind":"review-status"}\n',
		exitCode: 0,
	});
});

it("prepare without a workdir is answered as not valid", () => {
	const printed = Effect.runSync(
		run(commands, ["prepare", "https://host.test/change"]),
	);

	assert.deepEqual(printed, { line: '{"kind":"not-valid"}\n', exitCode: 1 });
});

it("status answers the review status", () => {
	const printed = Effect.runSync(run(commands, ["status", "/work"]));

	assert.deepEqual(printed, {
		line: '{"kind":"review-status"}\n',
		exitCode: 0,
	});
});
