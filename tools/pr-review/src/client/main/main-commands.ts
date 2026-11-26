import { Effect } from "effect";
import type { MainController } from "../../controller/main/main-controller.ts";
import {
	prepareCommandOf,
	statusCommandOf,
} from "../../perimeters/command-line.ts";
import type { Commands } from "../common/runner.ts";

const mainCommands = (controller: MainController): Commands => ({
	prepare: (commandArguments) =>
		prepareCommandOf(commandArguments).pipe(
			Effect.flatMap(({ url, workdir, probes }) =>
				controller.prepare(url, workdir, probes),
			),
		),
	status: (commandArguments) =>
		statusCommandOf(commandArguments).pipe(
			Effect.flatMap((workdir) => controller.status(workdir)),
		),
});

export { mainCommands };
