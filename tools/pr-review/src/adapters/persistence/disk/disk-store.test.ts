import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { z } from "zod";
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
import type { Workdir } from "../../../domain/workdir.ts";
import { WorkdirFailed } from "../../../domain/workdir-failed.ts";
import { probeIn } from "../../../perimeters/disk.ts";
import { RuleCodec } from "../../../perimeters/values.ts";
import { prepareDto } from "../../../perimeters/workdir.ts";
import { diskStoreOver, type Files } from "./disk-store.ts";

const workdir: Workdir = prepareDto({ workdir: "/work" }).toDomain();
const probe: Probe = probeIn(workdir, "probe-1");
const purpose: Rule = ruleSample("Stated purpose");
const review: Review = Change.of(urlSample(), []).review([
	taskSample(probe, [purpose, ruleSample("Delete unused")]),
]);

const filesOver = (kept: Map<string, string>): Files => ({
	read: (path: string): Promise<string> =>
		Promise.resolve(path).then((asked: string): string =>
			z.string().parse(kept.get(asked)),
		),
	write: (path: string, text: string): Promise<void> =>
		Promise.resolve().then((): void => {
			kept.set(path, text);
		}),
	append: (path: string, text: string): Promise<void> =>
		Promise.resolve().then((): void => {
			kept.set(path, `${z.string().parse(kept.get(path))}${text}`);
		}),
});

const readOnly = (kept: Map<string, string>): Files => ({
	...filesOver(kept),
	write: (): Promise<void> => Promise.reject(new Error("read only")),
	append: (): Promise<void> => Promise.reject(new Error("read only")),
});

const remainingOf = (found: Review): readonly string[] =>
	found.status().remaining.map((rule: Rule): string => RuleCodec.encode(rule));

it("a saved review is found in its workdir by a store that starts later", async () => {
	const kept = new Map<string, string>();

	await Effect.runPromise(diskStoreOver(filesOver(kept)).save(workdir, review));
	const found = await Effect.runPromise(
		diskStoreOver(filesOver(kept)).inWorkdir(workdir),
	);

	assert.deepEqual(remainingOf(found), ["Stated purpose", "Delete unused"]);
});

it("a workdir nothing was saved in holds no review", async () => {
	const missing = await Effect.runPromise(
		Effect.flip(diskStoreOver(filesOver(new Map())).inWorkdir(workdir)),
	);

	assert.equal(missing instanceof NoReview, true);
});

it("a probe finds its assignment in the workdir it leads to", async () => {
	const kept = new Map<string, string>();
	const store = diskStoreOver(filesOver(kept));

	await Effect.runPromise(store.save(workdir, review));
	const rules = await Effect.runPromise(
		store
			.ofProbe(probe)
			.pipe(Effect.map((assignment) => assignment.ledger().remaining.length)),
	);

	assert.equal(rules, 2);
});

it("what is appended is added as a line and is in the review read after", async () => {
	const kept = new Map<string, string>();
	const store = diskStoreOver(filesOver(kept));

	const saved = await Effect.runPromise(
		store
			.save(workdir, review)
			.pipe(
				Effect.map((): string =>
					z.string().parse(kept.get("/work/review.jsonl")),
				),
			),
	);
	const after = await Effect.runPromise(
		store.append(probe, Verdict.on(purpose)),
	);
	const text = z.string().parse(kept.get("/work/review.jsonl"));

	assert.deepEqual(
		[remainingOf(after), text],
		[
			["Delete unused"],
			`${saved}{"probe":"probe-1.L3dvcms","recorded":{"verdict":{"rule":"Stated purpose"}}}\n`,
		],
	);
});

it("a probe the review does not know appends nothing", async () => {
	const kept = new Map<string, string>();
	const store = diskStoreOver(filesOver(kept));

	await Effect.runPromise(store.save(workdir, review));
	const saved = kept.get("/work/review.jsonl");
	const missing = await Effect.runPromise(
		Effect.flip(store.append(probeIn(workdir, "probe-2"), Verdict.on(purpose))),
	);

	assert.deepEqual(
		[missing instanceof NoReview, kept.get("/work/review.jsonl")],
		[true, saved],
	);
});

it("a review that cannot be written is a failed workdir", async () => {
	const failed = await Effect.runPromise(
		Effect.flip(diskStoreOver(readOnly(new Map())).save(workdir, review)),
	);

	assert.equal(failed instanceof WorkdirFailed, true);
});

it("a line that cannot be appended is a failed workdir", async () => {
	const kept = new Map<string, string>();

	await Effect.runPromise(diskStoreOver(filesOver(kept)).save(workdir, review));
	const failed = await Effect.runPromise(
		Effect.flip(
			diskStoreOver(readOnly(kept)).append(probe, Verdict.on(purpose)),
		),
	);

	assert.equal(failed instanceof WorkdirFailed, true);
});
