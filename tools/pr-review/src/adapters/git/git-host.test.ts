import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { Change } from "../../domain/change.ts";
import { HostError } from "../../domain/host-error.ts";
import { UnknownFormat } from "../../domain/unknown-format.ts";
import { TargetUrl } from "../../generated/domain/target-url.g.ts";
import { Workdir } from "../../generated/domain/workdir.g.ts";
import { type Git, gitHostOver } from "./git-host.ts";

const url: TargetUrl = TargetUrl.codec.decode(
	"https://host.test/change.git@main..feature",
);
const workdir: Workdir = Workdir.codec.decode("/work");

it("get change clones the remote into the workdir and takes the diff of the range", async () => {
	const asked: (readonly string[])[] = [];
	const git: Git = (gitArguments: readonly string[]): Promise<string> => {
		asked.push(gitArguments);

		return Promise.resolve("");
	};

	await Effect.runPromise(gitHostOver(git).getChange(url, workdir));

	assert.deepEqual(asked, [
		[
			"clone",
			"--quiet",
			"--bare",
			"https://host.test/change.git",
			"/work/repository.git",
		],
		["-C", "/work/repository.git", "diff", "--unified=3", "main...feature"],
	]);
});

it("get change answers a change when git answers", async () => {
	const git: Git = (): Promise<string> => Promise.resolve("");
	const change = await Effect.runPromise(
		gitHostOver(git).getChange(url, workdir),
	);

	assert.equal(change instanceof Change, true);
});

it("get change fails with a host error when git fails", async () => {
	const git: Git = (): Promise<string> =>
		Promise.reject(new Error("no remote"));
	const failed = await Effect.runPromise(
		Effect.flip(gitHostOver(git).getChange(url, workdir)),
	);

	assert.equal(failed instanceof HostError, true);
});

it("get change does not ask git about an address of an unknown format", async () => {
	const asked: (readonly string[])[] = [];
	const git: Git = (gitArguments: readonly string[]): Promise<string> => {
		asked.push(gitArguments);

		return Promise.resolve("");
	};
	const failed = await Effect.runPromise(
		Effect.flip(
			gitHostOver(git).getChange(
				TargetUrl.codec.decode("https://host.test/change"),
				workdir,
			),
		),
	);

	assert.deepEqual([failed instanceof UnknownFormat, asked], [true, []]);
});
