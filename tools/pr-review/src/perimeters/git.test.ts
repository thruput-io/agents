import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import {
	probeSample,
	ruleSample,
	taskSample,
} from "../domain/sample.test-support.ts";
import { Acknowledgement } from "../generated/domain/acknowledgement.g.ts";
import { Forward } from "../generated/domain/forward.g.ts";
import { HostError } from "../generated/domain/host-error.g.ts";
import { Page } from "../generated/domain/page.g.ts";
import { TargetUrl } from "../generated/domain/target-url.g.ts";
import { UnknownFormat } from "../generated/domain/unknown-format.g.ts";
import { Workdir } from "../generated/domain/workdir.g.ts";
import {
	addressOf,
	changeOfDiff,
	repositoryIn,
	unreachableRemote,
} from "./git.ts";

const url: TargetUrl = TargetUrl.codec.decode(
	"https://host.test/change.git@main..feature",
);
const sentence =
	"By sending this ack I acknowledge I read all instructions and implicitly I know how to use the review tool";
const diff = [
	"diff --git a/src/one.ts b/src/one.ts",
	"index 1111111..2222222 100644",
	"--- a/src/one.ts",
	"+++ b/src/one.ts",
	"@@ -1,2 +1,3 @@",
	" first",
	"-old",
	"+new",
	"+added",
	"diff --git a/gone.ts b/gone.ts",
	"deleted file mode 100644",
	"--- a/gone.ts",
	"+++ /dev/null",
	"@@ -1 +0,0 @@",
	"-removed",
	"diff --git a/two.ts b/two.ts",
	"--- a/two.ts",
	"+++ b/two.ts",
	"@@ -10,0 +11 @@ context",
	"+eleven",
	"",
].join("\n");

const pagesOf = (text: string): readonly string[] => {
	const probe = probeSample("probe-1");
	const started = changeOfDiff(url, text)
		.review([taskSample(probe, [ruleSample("A rule")])])
		.after(probe, Acknowledgement.codec.decode(sentence));
	const first = started.after(probe, Forward.create());
	const second = first.after(probe, Forward.create());

	return [first, second].map((review): string =>
		Effect.runSync(
			review.assignmentOf(probe).pipe(
				Effect.flatMap((assignment) => assignment.briefing().page()),
				Effect.map((page: Page): string => Page.codec.encode(page)),
			),
		),
	);
};

it("an address names the remote, the base and the head", () => {
	assert.deepEqual(Effect.runSync(addressOf(url)), {
		remote: "https://host.test/change.git",
		base: "main",
		head: "feature",
	});
});

it("an address without a range is of an unknown format", () => {
	const plain: TargetUrl = TargetUrl.codec.decode("https://host.test/change");
	const refused = Effect.runSync(Effect.flip(addressOf(plain)));

	assert.equal(refused instanceof UnknownFormat, true);
});

it("the repository is kept inside the workdir", () => {
	assert.equal(
		repositoryIn(Workdir.codec.decode("/work")),
		"/work/repository.git",
	);
});

it("a diff gives a page per changed file, with the place of each added line", () => {
	assert.deepEqual(pagesOf(diff), [
		"\tfirst\nsrc/one.ts:2\tnew\nsrc/one.ts:3\tadded",
		"two.ts:11\televen",
	]);
});

it("a remote that does not answer is a host error", () => {
	assert.equal(unreachableRemote() instanceof HostError, true);
});
