import { Effect } from "effect";
import type { Change } from "../../domain/change.ts";
import type { Host, NotReviewable } from "../../domain/host.ts";
import type { HostError } from "../../generated/domain/host-error.g.ts";
import type { TargetUrl } from "../../generated/domain/target-url.g.ts";
import type { Workdir } from "../../generated/domain/workdir.g.ts";
import {
	addressOf,
	changeOfDiff,
	repositoryIn,
	unreachableRemote,
} from "../../perimeters/git.ts";

type Git = (gitArguments: readonly string[]) => Promise<string>;

const gitHostOver = (git: Git): Pick<Host, "getChange"> => {
	const asked = (
		gitArguments: readonly string[],
	): Effect.Effect<string, HostError> =>
		Effect.tryPromise({
			try: (): Promise<string> => git(gitArguments),
			catch: (): HostError => unreachableRemote(),
		});

	return {
		getChange: (
			url: TargetUrl,
			workdir: Workdir,
		): Effect.Effect<Change, NotReviewable> =>
			addressOf(url).pipe(
				Effect.flatMap(({ remote, base, head }) =>
					asked([
						"clone",
						"--quiet",
						"--bare",
						remote,
						repositoryIn(workdir),
					]).pipe(
						Effect.flatMap(
							(): Effect.Effect<string, HostError> =>
								asked([
									"-C",
									repositoryIn(workdir),
									"diff",
									"--unified=3",
									`${base}...${head}`,
								]),
						),
					),
				),
				Effect.map((diff: string): Change => changeOfDiff(url, diff)),
			),
	};
};

export type { Git };
export { gitHostOver };
