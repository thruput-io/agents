import { Match } from "effect";
import type { z } from "zod";
import { Instructions } from "../domain/instructions.ts";
import { AcknowledgementRequest } from "../generated/domain/acknowledgement-request.g.ts";
import { AlreadyReviewed } from "../generated/domain/already-reviewed.g.ts";
import { Context } from "../generated/domain/context.g.ts";
import { Definition } from "../generated/domain/definition.g.ts";
import { HostError } from "../generated/domain/host-error.g.ts";
import { NoReview } from "../generated/domain/no-review.g.ts";
import { NotStarted } from "../generated/domain/not-started.g.ts";
import { NotValid } from "../generated/domain/not-valid.g.ts";
import { Progress } from "../generated/domain/progress.g.ts";
import { Refused } from "../generated/domain/refused.g.ts";
import { ReviewStatus } from "../generated/domain/review-status.g.ts";
import { Ruleset } from "../generated/domain/ruleset.g.ts";
import { Surface } from "../generated/domain/surface.g.ts";
import { TooLarge } from "../generated/domain/too-large.g.ts";
import { UnknownFormat } from "../generated/domain/unknown-format.g.ts";
import { Usage } from "../generated/domain/usage.g.ts";
import { Workflow } from "../generated/domain/workflow.g.ts";
import type { failureAnswer as failureShape } from "../generated/perimeters/answers.g.ts";

type Answer = string | { readonly [key: string]: Answer };

type Refusal = z.infer<typeof failureShape>;

type Failure =
	| NotValid
	| UnknownFormat
	| AlreadyReviewed
	| TooLarge
	| Refused
	| HostError
	| NotStarted
	| NoReview;

interface Kind<Value> {
	readonly prototype: Value;
	[Symbol.hasInstance]: (value: object) => boolean;
}

const a =
	<Value extends object>(kind: Kind<Value>) =>
	(value: object): value is Value =>
		value instanceof kind;

const statusAnswer = (status: ReviewStatus): Answer =>
	ReviewStatus.codec.encode(status);

const progressAnswer = (progress: Progress): Answer =>
	Progress.codec.encode(progress);

const rulesAnswer = (ruleset: Ruleset): Answer => Ruleset.codec.encode(ruleset);

const definitionAnswer = (definition: Definition): Answer =>
	Definition.codec.encode(definition);

const surfaceAnswer = (surface: Surface): Answer =>
	Surface.codec.encode(surface);

const instructionsAnswer = (instructions: Instructions): Answer => ({
	workflow: Workflow.codec.encode(instructions.workflow()),
	context: Context.codec.encode(instructions.context()),
	usage: Usage.codec.encode(instructions.usage()),
	request: AcknowledgementRequest.codec.encode(instructions.request()),
});

const failureAnswer: (failure: Failure) => Answer = Match.type<Failure>().pipe(
	Match.when(a(NotValid), (): Refusal => ({ failure: "not-valid" })),
	Match.when(a(UnknownFormat), (): Refusal => ({ failure: "unknown-format" })),
	Match.when(
		a(AlreadyReviewed),
		(): Refusal => ({ failure: "already-reviewed" }),
	),
	Match.when(a(TooLarge), (): Refusal => ({ failure: "too-large" })),
	Match.when(a(Refused), (): Refusal => ({ failure: "refused" })),
	Match.when(a(HostError), (): Refusal => ({ failure: "host-error" })),
	Match.when(a(NotStarted), (): Refusal => ({ failure: "not-started" })),
	Match.when(a(NoReview), (): Refusal => ({ failure: "no-review" })),
	Match.exhaustive,
);

const isInstructions = (
	refused: Instructions | Failure,
): refused is Instructions => refused instanceof Instructions;

const notAcceptedAnswer: (refused: Instructions | Failure) => Answer =
	Match.type<Instructions | Failure>().pipe(
		Match.when(isInstructions, instructionsAnswer),
		Match.orElse(failureAnswer),
	);

export type { Answer };
export {
	definitionAnswer,
	failureAnswer,
	instructionsAnswer,
	notAcceptedAnswer,
	progressAnswer,
	rulesAnswer,
	statusAnswer,
	surfaceAnswer,
};
