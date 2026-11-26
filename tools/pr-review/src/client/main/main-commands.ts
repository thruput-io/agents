import { Effect } from "effect";
import type { MainController } from "../../controller/main/main-controller.ts";
import type { Workdir } from "../../generated/domain/workdir.g.ts";
import {
	type Answer,
	failureAnswer,
	statusAnswer,
} from "../../perimeters/answer.ts";
import {
	prepareCommandOf,
	statusCommandOf,
} from "../../perimeters/command-line.ts";
import type { Commands } from "../common/runner.ts";

const mainCommands = (controller: MainController): Commands => ({
	prepare: (
		commandArguments: readonly string[],
	): Effect.Effect<Answer, Answer> =>
		prepareCommandOf(commandArguments).pipe(
			Effect.flatMap(({ url, workdir, probes }) =>
				controller.prepare(url, workdir, probes),
			),
			Effect.map(statusAnswer),
			Effect.mapError(failureAnswer),
		),
	status: (
		commandArguments: readonly string[],
	): Effect.Effect<Answer, Answer> =>
		statusCommandOf(commandArguments).pipe(
			Effect.flatMap((workdir: Workdir) => controller.status(workdir)),
			Effect.map(statusAnswer),
			Effect.mapError(failureAnswer),
		),
});

export { mainCommands };
