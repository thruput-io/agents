import { Effect } from "effect";
import { z } from "zod";
import { NotValid } from "../generated/domain/not-valid.g.ts";
import { Probes } from "../generated/domain/probes.g.ts";
import { TargetUrl } from "../generated/domain/target-url.g.ts";
import { Workdir } from "../generated/domain/workdir.g.ts";

interface CommandLine {
	readonly name: string;
	readonly commandArguments: readonly string[];
}

interface PrepareCommand {
	readonly url: TargetUrl;
	readonly workdir: Workdir;
	readonly probes: Probes;
}

const CommandLineShape = z.tuple([z.string()]).rest(z.string());
const PrepareArguments = z.tuple([z.string(), z.string()]);
const StatusArguments = z.tuple([z.string()]);

const parsedBy = <Shape>(
	shape: z.ZodType<Shape>,
	given: readonly string[],
): Effect.Effect<Shape, NotValid> =>
	Effect.try({
		try: (): Shape => shape.parse(given),
		catch: (): NotValid => NotValid.create(),
	});

const commandLineOf = (
	given: readonly string[],
): Effect.Effect<CommandLine, NotValid> =>
	parsedBy(CommandLineShape, given).pipe(
		Effect.map(
			([name, ...commandArguments]: [string, ...string[]]): CommandLine => ({
				name,
				commandArguments,
			}),
		),
	);

const prepareCommandOf = (
	commandArguments: readonly string[],
): Effect.Effect<PrepareCommand, NotValid> =>
	parsedBy(PrepareArguments, commandArguments).pipe(
		Effect.flatMap(
			([url, workdir]: [string, string]): Effect.Effect<
				PrepareCommand,
				NotValid
			> =>
				Effect.all({
					url: TargetUrl.from(url),
					workdir: Workdir.from(workdir),
					probes: Effect.succeed(Probes.create()),
				}),
		),
	);

const statusCommandOf = (
	commandArguments: readonly string[],
): Effect.Effect<Workdir, NotValid> =>
	parsedBy(StatusArguments, commandArguments).pipe(
		Effect.flatMap(
			([workdir]: [string]): Effect.Effect<Workdir, NotValid> =>
				Workdir.from(workdir),
		),
	);

export type { CommandLine };
export { commandLineOf, prepareCommandOf, statusCommandOf };
