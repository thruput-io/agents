import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { NotValid } from "../generated/domain/not-valid.g.ts";
import { Probes } from "../generated/domain/probes.g.ts";
import { ReviewStatus } from "../generated/domain/review-status.g.ts";
import { TargetUrl } from "../generated/domain/target-url.g.ts";
import { Workdir } from "../generated/domain/workdir.g.ts";
import { prepareCommandOf, statusLineOf } from "./command-line.ts";

it("a prepare command line gives the target URL, the workdir and the probes", () => {
	const command = Effect.runSync(
		prepareCommandOf(["prepare", "https://host.test/change", "/work"]),
	);

	assert.deepEqual(
		[
			TargetUrl.dataOf(command.url),
			Workdir.dataOf(command.workdir),
			command.probes instanceof Probes,
		],
		["https://host.test/change", "/work", true],
	);
});

it("a command line of another shape is not valid", () => {
	const refused = Effect.runSync(Effect.flip(prepareCommandOf(["status"])));

	assert.equal(refused instanceof NotValid, true);
});

it("a prepare command line with an empty target URL is not valid", () => {
	const refused = Effect.runSync(
		Effect.flip(prepareCommandOf(["prepare", "", "/work"])),
	);

	assert.equal(refused instanceof NotValid, true);
});

it("a review status is printed as an object without properties", () => {
	assert.equal(statusLineOf(ReviewStatus.create()), "{}\n");
});
