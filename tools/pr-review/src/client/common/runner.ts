import { Effect } from "effect";
import { NotValid } from "../../generated/domain/not-valid.g.ts";

interface Answer {
	toJSON: () => string | { readonly kind: string };
}

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

const noCommand: Command = () => Effect.fail(NotValid.create());

const run = (
	commands: Commands,
	[name = "", ...commandArguments]: readonly string[],
): Effect.Effect<Printed> =>
	(commands[name] ?? noCommand)(commandArguments).pipe(
		Effect.match({
			onSuccess: (answer) => printed(answer, ANSWERED),
			onFailure: (failure) => printed(failure, REFUSED),
		}),
	);

export type { Commands };
export { run };
