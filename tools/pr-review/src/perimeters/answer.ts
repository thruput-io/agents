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
import type {
	Prepare200Response,
	PrepareDefaultResponse,
	Status200Response,
} from "../generated/perimeters/review-tool.g.ts";
import type {
	Ack200Response,
	AckDefaultResponse,
	Define200Response,
	Instructions200Response,
	Next200Response,
	Prev200Response,
	Report200Response,
	Rules200Response,
} from "../generated/perimeters/review-tool-probe.g.ts";

type Refusal = z.infer<typeof PrepareDefaultResponse>;
type Rules = z.infer<typeof Rules200Response>;
type Standing = z.infer<typeof Ack200Response> &
	z.infer<typeof Report200Response>;
type Told = z.infer<typeof Instructions200Response>;
type Defined = z.infer<typeof Define200Response>;
type Paged = z.infer<typeof Next200Response> & z.infer<typeof Prev200Response>;
type NotReady = z.infer<typeof AckDefaultResponse>;

interface Help {
	readonly description: string;
	readonly commands: Readonly<Record<string, string>>;
}

type Answer =
	| Status
	| Rules
	| Standing
	| Told
	| Defined
	| Paged
	| Refusal
	| NotReady
	| Help;
type Status = z.infer<typeof Prepare200Response> &
	z.infer<typeof Status200Response>;

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

const idsOf = (rules: readonly Rule[]): string[] =>
	rules.map((rule: Rule): string => Rule.codec.encode(rule));

const rulesAnswer = (rules: readonly Rule[]): Rules => ({
	rules: idsOf(rules),
});

const standingAnswer = (remaining: readonly Rule[]): Standing => ({
	remaining: idsOf(remaining),
});

const statusAnswer = ({ remaining, posts }: ReviewStatus): Status => ({
	remaining: idsOf(remaining),
	posted: posts.some((post: Post): boolean => post instanceof Posted),
	postFailed: posts.some((post: Post): boolean => post instanceof HostError),
});

const definitionAnswer = (definition: Definition): Defined =>
	Definition.codec.encode(definition);

const pageAnswer = (page: Page): Paged => Page.codec.encode(page);

const instructionsAnswer = (instructions: Instructions): Told => ({
	workflow: Workflow.codec.encode(instructions.workflow()),
	context: Context.codec.encode(instructions.context()),
	usage: Usage.codec.encode(instructions.usage()),
	request: AcknowledgementRequest.codec.encode(instructions.request()),
});

const failureAnswer: (failure: Failure) => Refusal = Match.type<Failure>().pipe(
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

const notReadyAnswer: (refused: Instructions | Failure) => NotReady =
	Match.type<Instructions | Failure>().pipe(
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
