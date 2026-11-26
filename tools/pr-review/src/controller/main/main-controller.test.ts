import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import type { Agent } from "../../domain/agent.ts";
import { Assignment } from "../../domain/assignment.ts";
import { Change } from "../../domain/change.ts";
import type { Host } from "../../domain/host.ts";
import { PendingReview } from "../../domain/pending-review.ts";
import type { ReviewStore } from "../../domain/review.ts";
import { NoReview } from "../../generated/domain/no-review.g.ts";
import { NotStarted } from "../../generated/domain/not-started.g.ts";
import { Outcome } from "../../generated/domain/outcome.g.ts";
import { Probes } from "../../generated/domain/probes.g.ts";
import { ReviewStatus } from "../../generated/domain/review-status.g.ts";
import { TargetUrl } from "../../generated/domain/target-url.g.ts";
import { UnknownFormat } from "../../generated/domain/unknown-format.g.ts";
import { Workdir } from "../../generated/domain/workdir.g.ts";
import { MainController } from "./main-controller.ts";

const url = Effect.runSync(TargetUrl.from("https://host.test/change"));
const workdir = Effect.runSync(Workdir.from("/work"));

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

it("prepare answers the status of the review", () => {
	const controller = MainController.over(host, store, agent);
	const prepared = controller.prepare(url, workdir, Probes.create());

	assert.equal(Effect.runSync(prepared) instanceof ReviewStatus, true);
});

it("prepare fails with what the host answers", () => {
	const unknownFormat = UnknownFormat.create();
	const refusing: Host = {
		...host,
		getChange: () => Effect.fail(unknownFormat),
	};
	const controller = MainController.over(refusing, store, agent);
	const prepared = controller.prepare(url, workdir, Probes.create());

	assert.equal(Effect.runSync(Effect.flip(prepared)), unknownFormat);
});

it("prepare fails when a sub agent is not started", () => {
	const notStarted = NotStarted.create();
	const stalling: Agent = { ...agent, spawn: () => Effect.fail(notStarted) };
	const controller = MainController.over(host, store, stalling);
	const prepared = controller.prepare(url, workdir, Probes.create());

	assert.equal(Effect.runSync(Effect.flip(prepared)), notStarted);
});

it("status answers the status of the stored review", () => {
	const controller = MainController.over(host, store, agent);
	const answered = Effect.runSync(controller.status(workdir));

	assert.equal(answered instanceof ReviewStatus, true);
});

it("status fails when the workdir holds no review", () => {
	const noReview = NoReview.create();
	const empty: ReviewStore = {
		...store,
		inWorkdir: () => Effect.fail(noReview),
	};
	const controller = MainController.over(host, empty, agent);

	assert.equal(
		Effect.runSync(Effect.flip(controller.status(workdir))),
		noReview,
	);
});
