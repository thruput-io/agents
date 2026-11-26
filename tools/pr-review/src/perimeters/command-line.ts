import { Effect } from "effect";
import { z } from "zod";
import { NotValid } from "../generated/domain/not-valid.g.ts";
import { Probes } from "../generated/domain/probes.g.ts";
import { TargetUrl } from "../generated/domain/target-url.g.ts";
import { Workdir } from "../generated/domain/workdir.g.ts";

interface PrepareCommand {
	readonly url: TargetUrl;
	readonly workdir: Workdir;
	readonly probes: Probes;
}

const PrepareArguments = z.tuple([z.string(), z.string()]);
const StatusArguments = z.tuple([z.string()]);

const prepareCommandOf = (
	commandArguments: readonly string[],
): Effect.Effect<PrepareCommand, NotValid> => {
	const parsed = PrepareArguments.safeParse(commandArguments);

	return parsed.success
		? Effect.all({
				url: TargetUrl.from(parsed.data[0]),
				workdir: Workdir.from(parsed.data[1]),
				probes: Effect.succeed(Probes.create()),
			})
		: Effect.fail(NotValid.create());
};

const statusCommandOf = (
	commandArguments: readonly string[],
): Effect.Effect<Workdir, NotValid> => {
	const parsed = StatusArguments.safeParse(commandArguments);

	return parsed.success
		? Workdir.from(parsed.data[0])
		: Effect.fail(NotValid.create());
};

export { prepareCommandOf, statusCommandOf };
