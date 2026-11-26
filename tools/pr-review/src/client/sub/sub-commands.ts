import { Effect } from "effect";
import { BriefingController } from "../../controller/sub/briefing-controller.ts";
import { PagingController } from "../../controller/sub/paging-controller.ts";
import { ProgressController } from "../../controller/sub/progress-controller.ts";
import type { Agent } from "../../domain/agent.ts";
import type { Host } from "../../domain/host.ts";
import type { Instructions } from "../../domain/instructions.ts";
import type { ReviewStore } from "../../domain/review.ts";
import { help } from "../../generated/client/sub/help.g.ts";
import type { Acknowledgement } from "../../generated/domain/acknowledgement.g.ts";
import type { NoReview } from "../../generated/domain/no-review.g.ts";
import type { Probe } from "../../generated/domain/probe.g.ts";
import type { Rule } from "../../generated/domain/rule.g.ts";
import {
	type Answer,
	definitionAnswer,
	failureAnswer,
	instructionsAnswer,
	notReadyAnswer,
	pageAnswer,
	rulesAnswer,
	standingAnswer,
} from "../../perimeters/answer.ts";
import {
	ackCommandOf,
	defineCommandOf,
	instructionsCommandOf,
	nextCommandOf,
	prevCommandOf,
	reportCommandOf,
	rulesCommandOf,
} from "../../perimeters/command-line.ts";
import type { Commands } from "../common/runner.ts";

interface SubControllers {
	readonly briefing: BriefingController;
	readonly paging: PagingController;
	readonly progress: ProgressController;
}

type Answered = Effect.Effect<Answer, Answer>;
type Standing = Effect.Effect<readonly Rule[], NoReview | Instructions>;

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
			Effect.map(pageAnswer),
			Effect.mapError(failureAnswer),
		),
	prev: (commandArguments: readonly string[]): Answered =>
		prevCommandOf(commandArguments).pipe(
			Effect.flatMap((probe: Probe) => paging.prev(probe)),
			Effect.map(pageAnswer),
			Effect.mapError(failureAnswer),
		),
	ack: (commandArguments: readonly string[]): Answered =>
		ackCommandOf(commandArguments).pipe(
			Effect.flatMap(
				({ probe, sent }): Standing =>
					sent.pipe(
						Effect.matchEffect({
							onSuccess: (acknowledgement: Acknowledgement): Standing =>
								progress.ack(probe, acknowledgement),
							onFailure: (): Standing => progress.standing(probe),
						}),
					),
			),
			Effect.map(standingAnswer),
			Effect.mapError(notReadyAnswer),
		),
	report: (commandArguments: readonly string[]): Answered =>
		reportCommandOf(commandArguments).pipe(
			Effect.flatMap(({ probe, verdict }) => progress.report(probe, verdict)),
			Effect.map(standingAnswer),
			Effect.mapError(notReadyAnswer),
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
