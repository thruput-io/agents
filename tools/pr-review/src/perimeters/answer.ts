import { Match } from "effect";
import type { z } from "zod";
import { AlreadyReviewed } from "../domain/already-reviewed.ts";
import type { Definition } from "../domain/definition.ts";
import { HostError } from "../domain/host-error.ts";
import { Instructions } from "../domain/instructions.ts";
import { NoPage } from "../domain/no-page.ts";
import { NoReview } from "../domain/no-review.ts";
import { NotAcknowledged } from "../domain/not-acknowledged.ts";
import { NotAssigned } from "../domain/not-assigned.ts";
import { NotDefined } from "../domain/not-defined.ts";
import { NotStarted } from "../domain/not-started.ts";
import { NotValid } from "../domain/not-valid.ts";
import type { Page } from "../domain/page.ts";
import type { Post } from "../domain/post.ts";
import { Posted } from "../domain/posted.ts";
import { Refused } from "../domain/refused.ts";
import type { ReviewStatus } from "../domain/review.ts";
import type { Rule } from "../domain/rule.ts";
import { TooLarge } from "../domain/too-large.ts";
import { UnknownFormat } from "../domain/unknown-format.ts";
import { WorkdirFailed } from "../domain/workdir-failed.ts";
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
import {
	AcknowledgementRequestCodec,
	ContextCodec,
	DefinitionCodec,
	PageCodec,
	RuleCodec,
	UsageCodec,
	WorkflowCodec,
} from "./values.ts";

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

interface Described {
	readonly operationId: string;
	readonly description: string;
}

interface ClientDocument {
	readonly info: { readonly description: string };
	readonly paths: Readonly<Record<string, Readonly<Record<string, Described>>>>;
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

const helpAnswer = ({ info, paths }: ClientDocument): Help => ({
	description: info.description,
	commands: Object.fromEntries(
		Object.values(paths)
			.flatMap((methods): readonly Described[] => Object.values(methods))
			.map(({ operationId, description }: Described) => [
				operationId,
				description,
			]),
	),
});

const idsOf = (rules: readonly Rule[]): string[] =>
	rules.map((rule: Rule): string => RuleCodec.encode(rule));

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
	DefinitionCodec.encode(definition);

const pageAnswer = (page: Page): Paged => PageCodec.encode(page);

const instructionsAnswer = (instructions: Instructions): Told => ({
	workflow: WorkflowCodec.encode(instructions.workflow()),
	context: ContextCodec.encode(instructions.context()),
	usage: UsageCodec.encode(instructions.usage()),
	request: AcknowledgementRequestCodec.encode(instructions.request()),
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
	helpAnswer,
	instructionsAnswer,
	notReadyAnswer,
	pageAnswer,
	rulesAnswer,
	standingAnswer,
	statusAnswer,
};
