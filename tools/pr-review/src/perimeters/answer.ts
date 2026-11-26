import { Match } from "effect";
import type { z } from "zod";
import { Instructions } from "../domain/instructions.ts";
import type { Post } from "../domain/post.ts";
import type { ReviewStatus } from "../domain/review.ts";
import { AcknowledgementRequest } from "../generated/domain/acknowledgement-request.g.ts";
import { AlreadyReviewed } from "../generated/domain/already-reviewed.g.ts";
import { Context } from "../generated/domain/context.g.ts";
import { Definition } from "../generated/domain/definition.g.ts";
import { HostError } from "../generated/domain/host-error.g.ts";
import { NoPage } from "../generated/domain/no-page.g.ts";
import { NoReview } from "../generated/domain/no-review.g.ts";
import { NotAcknowledged } from "../generated/domain/not-acknowledged.g.ts";
import { NotAssigned } from "../generated/domain/not-assigned.g.ts";
import { NotDefined } from "../generated/domain/not-defined.g.ts";
import { NotStarted } from "../generated/domain/not-started.g.ts";
import { NotValid } from "../generated/domain/not-valid.g.ts";
import { Page } from "../generated/domain/page.g.ts";
import { Posted } from "../generated/domain/posted.g.ts";
import { Refused } from "../generated/domain/refused.g.ts";
import { Rule } from "../generated/domain/rule.g.ts";
import { TooLarge } from "../generated/domain/too-large.g.ts";
import { UnknownFormat } from "../generated/domain/unknown-format.g.ts";
import { Usage } from "../generated/domain/usage.g.ts";
import { WorkdirFailed } from "../generated/domain/workdir-failed.g.ts";
import { Workflow } from "../generated/domain/workflow.g.ts";
import type { failureAnswer as failureShape } from "../generated/perimeters/answers.g.ts";

type Answer =
	| string
	| boolean
	| readonly Answer[]
	| { readonly [key: string]: Answer };

type Refusal = z.infer<typeof failureShape>;

type Failure =
	| NotValid
	| UnknownFormat
	| AlreadyReviewed
	| TooLarge
	| Refused
	| HostError
	| NotStarted
	| NoReview
	| NotDefined
	| NotAssigned
	| NoPage
	| NotAcknowledged
	| WorkdirFailed;

interface Kind<Value> {
	readonly prototype: Value;
	[Symbol.hasInstance]: (value: object) => boolean;
}

const a =
	<Value extends object>(kind: Kind<Value>) =>
	(value: object): value is Value =>
		value instanceof kind;

const idsOf = (rules: readonly Rule[]): readonly string[] =>
	rules.map((rule: Rule): string => Rule.codec.encode(rule));

const rulesAnswer = (rules: readonly Rule[]): Answer => ({
	rules: idsOf(rules),
});

const standingAnswer = (remaining: readonly Rule[]): Answer => ({
	remaining: idsOf(remaining),
});

const statusAnswer = ({ remaining, posts }: ReviewStatus): Answer => ({
	remaining: idsOf(remaining),
	posted: posts.some((post: Post): boolean => post instanceof Posted),
	postFailed: posts.some((post: Post): boolean => post instanceof HostError),
});

const definitionAnswer = (definition: Definition): Answer =>
	Definition.codec.encode(definition);

const pageAnswer = (page: Page): Answer => Page.codec.encode(page);

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
	Match.when(a(NotDefined), (): Refusal => ({ failure: "not-defined" })),
	Match.when(a(NotAssigned), (): Refusal => ({ failure: "not-assigned" })),
	Match.when(a(NoPage), (): Refusal => ({ failure: "no-page" })),
	Match.when(
		a(NotAcknowledged),
		(): Refusal => ({ failure: "not-acknowledged" }),
	),
	Match.when(a(WorkdirFailed), (): Refusal => ({ failure: "workdir-failed" })),
	Match.exhaustive,
);

const isInstructions = (
	refused: Instructions | Failure,
): refused is Instructions => refused instanceof Instructions;

const isFailure = (refused: Instructions | Failure): refused is Failure =>
	!isInstructions(refused);

const notReadyAnswer: (refused: Instructions | Failure) => Answer = Match.type<
	Instructions | Failure
>().pipe(
	Match.when(isInstructions, instructionsAnswer),
	Match.when(isFailure, failureAnswer),
	Match.exhaustive,
);

export type { Answer };
export {
	definitionAnswer,
	failureAnswer,
	instructionsAnswer,
	notReadyAnswer,
	pageAnswer,
	rulesAnswer,
	standingAnswer,
	statusAnswer,
};
