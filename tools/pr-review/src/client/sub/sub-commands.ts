import { Effect } from "effect";
import { BriefingController } from "../../controller/sub/briefing-controller.ts";
import { PagingController } from "../../controller/sub/paging-controller.ts";
import { ProgressController } from "../../controller/sub/progress-controller.ts";
import type { Agent } from "../../domain/agent.ts";
import type { Host } from "../../domain/host.ts";
import type { ReviewStore } from "../../domain/review.ts";
import { help } from "../../generated/client/sub/help.g.ts";
import type { Probe } from "../../generated/domain/probe.g.ts";
import {
	type Answer,
	definitionAnswer,
	failureAnswer,
	instructionsAnswer,
	notAcceptedAnswer,
	progressAnswer,
	rulesAnswer,
	surfaceAnswer,
} from "../../perimeters/answer.ts";
import {
	ackCommandOf,
	defineCommandOf,
	instructionsCommandOf,
	nextCommandOf,
	prevCommandOf,
	rulesCommandOf,
} from "../../perimeters/command-line.ts";
import type { Commands } from "../common/runner.ts";

interface SubControllers {
	readonly briefing: BriefingController;
	readonly paging: PagingController;
	readonly progress: ProgressController;
}

type Answered = Effect.Effect<Answer, Answer>;

const subCommands = ({
	briefing,
	paging,
	progress,
}: SubControllers): Commands => ({
	instructions: (commandArguments: readonly string[]): Answered =>
		instructionsCommandOf(commandArguments).pipe(
			Effect.flatMap((probe: Probe) => briefing.instructions(probe)),
			Effect.map(instructionsAnswer),
			Effect.mapError(failureAnswer),
		),
	rules: (commandArguments: readonly string[]): Answered =>
		rulesCommandOf(commandArguments).pipe(
			Effect.flatMap((probe: Probe) => briefing.rules(probe)),
			Effect.map(rulesAnswer),
			Effect.mapError(failureAnswer),
		),
	define: (commandArguments: readonly string[]): Answered =>
		defineCommandOf(commandArguments).pipe(
			Effect.flatMap(({ probe, term }) => briefing.define(probe, term)),
			Effect.map(definitionAnswer),
			Effect.mapError(failureAnswer),
		),
	next: (commandArguments: readonly string[]): Answered =>
		nextCommandOf(commandArguments).pipe(
			Effect.flatMap((probe: Probe) => paging.next(probe)),
			Effect.map(surfaceAnswer),
			Effect.mapError(failureAnswer),
		),
	prev: (commandArguments: readonly string[]): Answered =>
		prevCommandOf(commandArguments).pipe(
			Effect.flatMap((probe: Probe) => paging.prev(probe)),
			Effect.map(surfaceAnswer),
			Effect.mapError(failureAnswer),
		),
	ack: (commandArguments: readonly string[]): Answered =>
		ackCommandOf(commandArguments).pipe(
			Effect.flatMap(({ probe, acknowledgement }) =>
				progress.ack(probe, acknowledgement),
			),
			Effect.map(progressAnswer),
			Effect.mapError(notAcceptedAnswer),
		),
});

const subTool = (host: Host, store: ReviewStore, agent: Agent): Commands => ({
	...subCommands({
		briefing: BriefingController.over(store),
		paging: PagingController.over(store),
		progress: ProgressController.over(host, store, agent),
	}),
	"-h": (): Answered => Effect.succeed(help),
});

export { subTool };
