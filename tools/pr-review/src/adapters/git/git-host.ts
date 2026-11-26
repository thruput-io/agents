import { Effect } from "effect";
import type { Change } from "../../domain/change.ts";
import type { Host } from "../../domain/host.ts";
import type { HostError } from "../../generated/domain/host-error.g.ts";
import type { TargetUrl } from "../../generated/domain/target-url.g.ts";
import {
	changeOfRemote,
	remoteOf,
	unreachableRemote,
} from "../../perimeters/git.ts";

type Git = (gitArguments: readonly string[]) => Promise<string>;

const gitHostOver = (git: Git): Pick<Host, "getChange"> => ({
	getChange: (url: TargetUrl): Effect.Effect<Change, HostError> =>
		Effect.tryPromise({
			try: (): Promise<string> =>
				git(["ls-remote", "--exit-code", remoteOf(url)]),
			catch: (): HostError => unreachableRemote(),
		}).pipe(Effect.map((): Change => changeOfRemote(url))),
});

export type { Git };
export { gitHostOver };
