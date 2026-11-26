import assert from "node:assert/strict";
import { test as it } from "node:test";
import { textOf } from "../domain/text.ts";
import { reviewStatusFrom } from "../generated/domain/factory.g.ts";
import { ReviewStatusCodec, TargetUrlCodec, WorkdirCodec } from "./codec.ts";

it("a target URL is parsed from its text and encoded back to it", () => {
	const url = TargetUrlCodec.parse("https://host.test/change");

	assert.deepEqual(
		[textOf(url), TargetUrlCodec.encode(url)],
		["https://host.test/change", "https://host.test/change"],
	);
});

it("an empty target URL is not parsed", () => {
	assert.equal(TargetUrlCodec.safeParse("").success, false);
});

it("a workdir is parsed from its text and encoded back to it", () => {
	const workdir = WorkdirCodec.parse("/work");

	assert.deepEqual(
		[textOf(workdir), WorkdirCodec.encode(workdir)],
		["/work", "/work"],
	);
});

it("a review status is encoded as an object without properties", () => {
	assert.deepEqual(ReviewStatusCodec.encode(reviewStatusFrom()), {});
});
