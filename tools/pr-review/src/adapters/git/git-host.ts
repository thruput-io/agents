import { Effect } from "effect";
import type { Change } from "../../domain/change.ts";
import type { Host, NotReviewable } from "../../domain/host.ts";
import type { HostError } from "../../domain/host-error.ts";
import type { Workdir } from "../../domain/workdir.ts";
import type { TargetUrl } from "../../generated/domain/target-url.g.ts";
import {
	addressOf,
	changeOfDiff,
	repositoryIn,
	unreachableRemote,
} from "../../perimeters/git.ts";

type Git = (gitArguments: readonly string[]) => Promise<string>;
type Asked = (
	gitArguments: readonly string[],
) => Effect.Effect<string, HostError>;

const askedOver =
	(git: Git): Asked =>
	(gitArguments: readonly string[]): Effect.Effect<string, HostError> =>
		Effect.tryPromise({
			try: (): Promise<string> => git(gitArguments),
			catch: (): HostError => unreachableRemote(),
		});

const cloneOf = (remote: string, workdir: Workdir): readonly string[] => [
	"clone",
	"--quiet",
	"--bare",
	remote,
	repositoryIn(workdir),
];

const diffOf = (workdir: Workdir, range: string): readonly string[] => [
	"-C",
	repositoryIn(workdir),
	"diff",
	"--unified=3",
	range,
];

const gitHostOver = (git: Git): Pick<Host, "getChange"> => {
	const asked = askedOver(git);

	return {
		getChange: (
			url: TargetUrl,
			workdir: Workdir,
		): Effect.Effect<Change, NotReviewable> =>
			addressOf(url).pipe(
				Effect.flatMap(({ remote, base, head }) =>
					asked(cloneOf(remote, workdir)).pipe(
						Effect.flatMap(
							(): Effect.Effect<string, HostError> =>
								asked(diffOf(workdir, `${base}...${head}`)),
						),
					),
				),
				Effect.map((diff: string): Change => changeOfDiff(url, diff)),
			),
	};
};

export type { Git };
export { gitHostOver };
