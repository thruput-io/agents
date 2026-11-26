import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Effect } from "effect";
import type { Host } from "../../domain/host.ts";
import {
	changeOfRemote,
	remoteOf,
	unreachableRemote,
} from "../../perimeters/git.ts";

const git = promisify(execFile);

const gitHost: Host = {
	getChange: (url) =>
		Effect.tryPromise({
			try: () => git("git", ["ls-remote", "--exit-code", remoteOf(url)]),
			catch: () => unreachableRemote(),
		}).pipe(Effect.map(() => changeOfRemote())),
	post: () => Effect.fail(unreachableRemote()),
};

export { gitHost };
