import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { Change } from "../../domain/change.ts";
import { HostError } from "../../generated/domain/host-error.g.ts";
import { TargetUrl } from "../../generated/domain/target-url.g.ts";
import { gitBinary } from "./git-binary.ts";
import { gitHostOver } from "./git-host.ts";

const mockHost = "http://localhost:8617";

it("get change answers a change for a repository the host serves", async () => {
	const url: TargetUrl = TargetUrl.codec.decode(`${mockHost}/first-review.git`);
	const change = await Effect.runPromise(gitHostOver(gitBinary).getChange(url));

	assert.equal(change instanceof Change, true);
});

it("get change fails with a host error for a repository the host does not serve", async () => {
	const url: TargetUrl = TargetUrl.codec.decode(`${mockHost}/missing.git`);
	const failed = await Effect.runPromise(
		Effect.flip(gitHostOver(gitBinary).getChange(url)),
	);

	assert.equal(failed instanceof HostError, true);
});
