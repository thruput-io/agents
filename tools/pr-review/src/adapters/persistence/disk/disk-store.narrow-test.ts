import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as it } from "node:test";
import { Effect } from "effect";
import { Change } from "../../../domain/change.ts";
import type { Review } from "../../../domain/review.ts";
import {
	probeSample,
	ruleSample,
	taskSample,
	urlSample,
} from "../../../domain/sample.test-support.ts";
import { Verdict } from "../../../domain/verdict.ts";
import { NoReview } from "../../../generated/domain/no-review.g.ts";
import type { Probe } from "../../../generated/domain/probe.g.ts";
import { Rule } from "../../../generated/domain/rule.g.ts";
import { Workdir } from "../../../generated/domain/workdir.g.ts";
import { WorkdirFailed } from "../../../generated/domain/workdir-failed.g.ts";
import { diskFiles } from "./disk-files.ts";
import { diskStoreOver } from "./disk-store.ts";

const purpose: Rule = ruleSample("Stated purpose");
const emptyDirectory = (): string =>
	mkdtempSync(join(tmpdir(), "narrow-disk-"));
const probeIn = (directory: string): Probe =>
	probeSample(`probe-1.${Buffer.from(directory).toString("base64url")}`);
const reviewOf = (probe: Probe): Review =>
	Change.of(urlSample(), []).review([
		taskSample(probe, [purpose, ruleSample("Delete unused")]),
	]);

it("a review saved on disk and appended to is read back by a store that starts later", async () => {
	const directory = emptyDirectory();
	const probe = probeIn(directory);
	const workdir = Workdir.codec.decode(directory);

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
			.remaining.map((rule: Rule): string => Rule.codec.encode(rule)),
		["Delete unused"],
	);
});

it("an empty directory holds no review", async () => {
	const missing = await Effect.runPromise(
		Effect.flip(
			diskStoreOver(diskFiles).inWorkdir(
				Workdir.codec.decode(emptyDirectory()),
			),
		),
	);

	assert.equal(missing instanceof NoReview, true);
});

it("a review cannot be saved in a directory that does not exist", async () => {
	const directory = join(emptyDirectory(), "missing");
	const failed = await Effect.runPromise(
		Effect.flip(
			diskStoreOver(diskFiles).save(
				Workdir.codec.decode(directory),
				reviewOf(probeIn(directory)),
			),
		),
	);

	assert.equal(failed instanceof WorkdirFailed, true);
});
