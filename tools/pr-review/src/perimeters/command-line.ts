import { Effect } from "effect";
import { z } from "zod";
import { NotValid } from "../generated/domain/not-valid.g.ts";
import { Probes } from "../generated/domain/probes.g.ts";
import { ReviewStatus } from "../generated/domain/review-status.g.ts";
import { TargetUrl } from "../generated/domain/target-url.g.ts";
import { Workdir } from "../generated/domain/workdir.g.ts";

interface PrepareCommand {
	readonly url: TargetUrl;
	readonly workdir: Workdir;
	readonly probes: Probes;
}

const PrepareArguments = z.tuple([
	z.literal("prepare"),
	z.string(),
	z.string(),
]);

const prepareCommandOf = (
	argv: readonly string[],
): Effect.Effect<PrepareCommand, NotValid> => {
	const parsed = PrepareArguments.safeParse(argv);

	return parsed.success
		? Effect.all({
				url: TargetUrl.from(parsed.data[1]),
				workdir: Workdir.from(parsed.data[2]),
				probes: Effect.succeed(Probes.create()),
			})
		: Effect.fail(NotValid.create());
};

const statusLineOf = (status: ReviewStatus): string =>
	`${JSON.stringify(ReviewStatus.dataOf(status))}\n`;

export { prepareCommandOf, statusLineOf };
