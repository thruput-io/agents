import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
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
import { sessionAt } from "../../../perimeters/session.test-support.ts";
import { RuleCodec } from "../../../perimeters/values.ts";
import { diskFiles } from "./disk-files.ts";
import { diskStoreOver } from "./disk-store.ts";

const purpose: Rule = ruleSample("Stated purpose");
const emptyDirectory = (): string =>
	mkdtempSync(join(tmpdir(), "narrow-disk-"));
const probeOf = (directory: string): Probe =>
	probeIn(sessionAt(directory), "probe-1");
const reviewOf = (probe: Probe): Review =>
	Change.of(urlSample(), []).review([
		taskSample(probe, [purpose, ruleSample("Delete unused")]),
	]);

it("a review saved on disk and appended to is read back by a store that starts later", async () => {
	const directory = emptyDirectory();
	const probe = probeOf(directory);
	const workdir = sessionAt(directory);

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
			diskStoreOver(diskFiles).inWorkdir(sessionAt(emptyDirectory())),
		),
	);

	assert.equal(missing instanceof NoReview, true);
});

it("a review is saved in a directory that the store creates", async () => {
	const directory = join(emptyDirectory(), "created");
	const session = sessionAt(directory);
	const kept = await Effect.runPromise(
		diskStoreOver(diskFiles)
			.save(session, reviewOf(probeOf(directory)))
			.pipe(Effect.flatMap(() => diskStoreOver(diskFiles).inWorkdir(session))),
	);

	assert.deepEqual(
		kept.status().remaining.map((rule: Rule): string => RuleCodec.encode(rule)),
		["Stated purpose", "Delete unused"],
	);
});

it("a review cannot be saved where a file is in the way of its directory", async () => {
	const directory = join(emptyDirectory(), "taken");

	writeFileSync(directory, "a file");

	const failed = await Effect.runPromise(
		Effect.flip(
			diskStoreOver(diskFiles).save(
				sessionAt(join(directory, "below")),
				reviewOf(probeOf(directory)),
			),
		),
	);

	assert.deepEqual(failed, WorkdirFailed.create());
});
