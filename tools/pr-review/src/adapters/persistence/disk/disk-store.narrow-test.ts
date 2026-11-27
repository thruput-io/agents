import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as it } from "node:test";
import { Effect } from "effect";
import { Change } from "../../../domain/change.ts";
import { NoReview } from "../../../domain/no-review.ts";
import type { Probe } from "../../../domain/probe.ts";
import type { Review } from "../../../domain/review.ts";
import type { Rule } from "../../../domain/rule.ts";
import {
	ruleSample,
	taskSample,
	urlSample,
} from "../../../domain/sample.test-support.ts";
import { Verdict } from "../../../domain/verdict.ts";
import { WorkdirFailed } from "../../../domain/workdir-failed.ts";
import { probeIn } from "../../../perimeters/disk.ts";
import { RuleCodec, WorkdirCodec } from "../../../perimeters/values.ts";
import { diskFiles } from "./disk-files.ts";
import { diskStoreOver } from "./disk-store.ts";

const purpose: Rule = ruleSample("Stated purpose");
const emptyDirectory = (): string =>
	mkdtempSync(join(tmpdir(), "narrow-disk-"));
const probeOf = (directory: string): Probe =>
	probeIn(WorkdirCodec.decode(directory), "probe-1");
const reviewOf = (probe: Probe): Review =>
	Change.of(urlSample(), []).review([
		taskSample(probe, [purpose, ruleSample("Delete unused")]),
	]);

it("a review saved on disk and appended to is read back by a store that starts later", async () => {
	const directory = emptyDirectory();
	const probe = probeOf(directory);
	const workdir = WorkdirCodec.decode(directory);

	await Effect.runPromise(
		diskStoreOver(diskFiles).save(workdir, reviewOf(probe)),
	);
	await Effect.runPromise(
		diskStoreOver(diskFiles).append(probe, Verdict.on(purpose)),
	);
	const found = await Effect.runPromise(
		diskStoreOver(diskFiles).inWorkdir(workdir),
	);

	assert.deepEqual(
		found
			.status()
			.remaining.map((rule: Rule): string => RuleCodec.encode(rule)),
		["Delete unused"],
	);
});

it("an empty directory holds no review", async () => {
	const missing = await Effect.runPromise(
		Effect.flip(
			diskStoreOver(diskFiles).inWorkdir(WorkdirCodec.decode(emptyDirectory())),
		),
	);

	assert.equal(missing instanceof NoReview, true);
});

it("a review cannot be saved in a directory that does not exist", async () => {
	const directory = join(emptyDirectory(), "missing");
	const failed = await Effect.runPromise(
		Effect.flip(
			diskStoreOver(diskFiles).save(
				WorkdirCodec.decode(directory),
				reviewOf(probeOf(directory)),
			),
		),
	);

	assert.equal(failed instanceof WorkdirFailed, true);
});
