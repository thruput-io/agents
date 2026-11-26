import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { Change } from "../domain/change.ts";
import { HostError } from "../generated/domain/host-error.g.ts";
import { TargetUrl } from "../generated/domain/target-url.g.ts";
import { changeOfRemote, remoteOf, unreachableRemote } from "./git.ts";

it("a target URL is the remote git is asked for", () => {
	const url = Effect.runSync(TargetUrl.from("https://host.test/change.git"));

	assert.equal(remoteOf(url), "https://host.test/change.git");
});

it("a remote that answers is a change", () => {
	assert.equal(changeOfRemote() instanceof Change, true);
});

it("a remote that does not answer is a host error", () => {
	assert.equal(unreachableRemote() instanceof HostError, true);
});
