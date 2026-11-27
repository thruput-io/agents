import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as it } from "node:test";
import { Effect } from "effect";
import type { Change } from "../../domain/change.ts";
import { Forward } from "../../domain/forward.ts";
import { HostError } from "../../domain/host-error.ts";
import {
	probeSample,
	ruleSample,
	taskSample,
} from "../../domain/sample.test-support.ts";
import { Acknowledgement } from "../../generated/domain/acknowledgement.g.ts";
import { Page } from "../../generated/domain/page.g.ts";
import type { Probe } from "../../generated/domain/probe.g.ts";
import { TargetUrl } from "../../generated/domain/target-url.g.ts";
import { Workdir } from "../../generated/domain/workdir.g.ts";
import { gitBinary } from "./git-binary.ts";
import { gitHostOver } from "./git-host.ts";

const mockHost = "http://localhost:8617";
const sentence =
	"By sending this ack I acknowledge I read all instructions and implicitly I know how to use the review tool";

const emptyWorkdir = (): Workdir =>
	Workdir.codec.decode(mkdtempSync(join(tmpdir(), "narrow-git-")));

const firstPageOf = (change: Change): string => {
	const probe: Probe = probeSample("probe-1");
	const review = change
		.review([taskSample(probe, [ruleSample("A rule")])])
		.after(probe, Acknowledgement.codec.decode(sentence))
		.after(probe, Forward.create());

	return Effect.runSync(
		review.assignmentOf(probe).pipe(
			Effect.flatMap((assignment) => assignment.briefing().page()),
			Effect.map((page: Page): string => Page.codec.encode(page)),
		),
	);
};

it("get change reads the lines a branch adds from a repository the host serves", async () => {
	const url: TargetUrl = TargetUrl.codec.decode(
		`${mockHost}/first-review.git@main..first-review`,
	);
	const change: Change = await Effect.runPromise(
		gitHostOver(gitBinary).getChange(url, emptyWorkdir()),
	);

	assert.equal(firstPageOf(change), "\tone\nfile.txt:2\ttwo");
});

it("get change fails with a host error for a repository the host does not serve", async () => {
	const url: TargetUrl = TargetUrl.codec.decode(
		`${mockHost}/missing.git@main..first-review`,
	);
	const failed = await Effect.runPromise(
		Effect.flip(gitHostOver(gitBinary).getChange(url, emptyWorkdir())),
	);

	assert.equal(failed instanceof HostError, true);
});
