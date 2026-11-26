import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Effect } from "effect";
import type { Change } from "../../domain/change.ts";
import type { Host } from "../../domain/host.ts";
import type { HostError } from "../../generated/domain/host-error.g.ts";
import type { Outcome } from "../../generated/domain/outcome.g.ts";
import type { TargetUrl } from "../../generated/domain/target-url.g.ts";
import {
	changeOfRemote,
	remoteOf,
	unreachableRemote,
} from "../../perimeters/git.ts";

const git = promisify(execFile);

const gitHost: Host = {
	getChange: (url: TargetUrl): Effect.Effect<Change, HostError> =>
		Effect.tryPromise({
			try: () => git("git", ["ls-remote", "--exit-code", remoteOf(url)]),
			catch: (): HostError => unreachableRemote(),
		}).pipe(Effect.map((): Change => changeOfRemote())),
	post: (): Effect.Effect<Outcome, HostError> =>
		Effect.fail(unreachableRemote()),
};

export { gitHost };
