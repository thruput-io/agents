import { Effect } from "effect";
import document from "../../../schemas/review-tool.openapi.json" with {
	type: "json",
};
import { MainController } from "../../controller/main/main-controller.ts";
import type { Agent } from "../../domain/agent.ts";
import type { Host } from "../../domain/host.ts";
import type { ReviewStore } from "../../domain/review-store.ts";
import type { Workdir } from "../../domain/workdir.ts";
import {
	type Answer,
	failureAnswer,
	helpAnswer,
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

const mainTool = (host: Host, store: ReviewStore, agent: Agent): Commands => ({
	...mainCommands(MainController.over(host, store, agent)),
	"-h": (): Effect.Effect<Answer, Answer> =>
		Effect.succeed(helpAnswer(document)),
});

export { mainTool };
