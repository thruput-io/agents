import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { Change } from "../../domain/change.ts";
import { HostError } from "../../generated/domain/host-error.g.ts";
import { TargetUrl } from "../../generated/domain/target-url.g.ts";
import { type Git, gitHostOver } from "./git-host.ts";

const url: TargetUrl = Effect.runSync(
	TargetUrl.from("https://host.test/change.git"),
);

it("get change asks git for the refs of the target URL", async () => {
	const asked: (readonly string[])[] = [];
	const git: Git = (gitArguments: readonly string[]): Promise<string> => {
		asked.push(gitArguments);

		return Promise.resolve("");
	};

	await Effect.runPromise(gitHostOver(git).getChange(url));

	assert.deepEqual(asked, [
		["ls-remote", "--exit-code", "https://host.test/change.git"],
	]);
});

it("get change answers a change when git answers", async () => {
	const git: Git = (): Promise<string> => Promise.resolve("");
	const change = await Effect.runPromise(gitHostOver(git).getChange(url));

	assert.equal(change instanceof Change, true);
});

it("get change fails with a host error when git fails", async () => {
	const git: Git = (): Promise<string> =>
		Promise.reject(new Error("no remote"));
	const failed = await Effect.runPromise(
		Effect.flip(gitHostOver(git).getChange(url)),
	);

	assert.equal(failed instanceof HostError, true);
});
