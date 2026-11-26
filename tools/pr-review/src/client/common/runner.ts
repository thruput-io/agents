import { Effect } from "effect";
import { NotValid } from "../../generated/domain/not-valid.g.ts";
import { type Answer, failureAnswer } from "../../perimeters/answer.ts";
import {
	type CommandLine,
	commandLineOf,
} from "../../perimeters/command-line.ts";

interface Printed {
	readonly line: string;
	readonly exitCode: number;
}

type Command = (
	commandArguments: readonly string[],
) => Effect.Effect<Answer, Answer>;

type Commands = Readonly<Record<string, Command>>;

const ANSWERED = 0;
const REFUSED = 1;

const printed = (answer: Answer, exitCode: number): Printed => ({
	line: `${JSON.stringify(answer)}\n`,
	exitCode,
});

const answered = (
	commands: Commands,
	{ name, commandArguments }: CommandLine,
): Effect.Effect<Answer, Answer> =>
	Effect.fromNullishOr(commands[name]).pipe(
		Effect.mapError((): Answer => failureAnswer(NotValid.create())),
		Effect.flatMap(
			(command: Command): Effect.Effect<Answer, Answer> =>
				command(commandArguments),
		),
	);

const run = (
	commands: Commands,
	given: readonly string[],
): Effect.Effect<Printed> =>
	commandLineOf(given).pipe(
		Effect.mapError(failureAnswer),
		Effect.flatMap(
			(commandLine: CommandLine): Effect.Effect<Answer, Answer> =>
				answered(commands, commandLine),
		),
		Effect.match({
			onSuccess: (answer: Answer): Printed => printed(answer, ANSWERED),
			onFailure: (failure: Answer): Printed => printed(failure, REFUSED),
		}),
	);

export type { Commands, Printed };
export { run };
