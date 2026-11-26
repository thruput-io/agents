import { Match } from "effect";
import { AlreadyReviewed } from "../generated/domain/already-reviewed.g.ts";
import { HostError } from "../generated/domain/host-error.g.ts";
import { NoReview } from "../generated/domain/no-review.g.ts";
import { NotStarted } from "../generated/domain/not-started.g.ts";
import { NotValid } from "../generated/domain/not-valid.g.ts";
import { Refused } from "../generated/domain/refused.g.ts";
import { ReviewStatus } from "../generated/domain/review-status.g.ts";
import { TooLarge } from "../generated/domain/too-large.g.ts";
import { UnknownFormat } from "../generated/domain/unknown-format.g.ts";

type Answer = Readonly<Record<string, string>>;

type Failure =
	| NotValid
	| UnknownFormat
	| AlreadyReviewed
	| TooLarge
	| Refused
	| HostError
	| NotStarted
	| NoReview;

const statusAnswer = (status: ReviewStatus): Answer =>
	ReviewStatus.dataOf(status);

interface Kind<Value extends Failure> {
	readonly prototype: Value;
	[Symbol.hasInstance]: (failure: Failure) => boolean;
}

const a =
	<Value extends Failure>(kind: Kind<Value>) =>
	(failure: Failure): failure is Value =>
		failure instanceof kind;

const failureAnswer: (failure: Failure) => Answer = Match.type<Failure>().pipe(
	Match.when(a(NotValid), (): Answer => ({ failure: "not-valid" })),
	Match.when(a(UnknownFormat), (): Answer => ({ failure: "unknown-format" })),
	Match.when(
		a(AlreadyReviewed),
		(): Answer => ({ failure: "already-reviewed" }),
	),
	Match.when(a(TooLarge), (): Answer => ({ failure: "too-large" })),
	Match.when(a(Refused), (): Answer => ({ failure: "refused" })),
	Match.when(a(HostError), (): Answer => ({ failure: "host-error" })),
	Match.when(a(NotStarted), (): Answer => ({ failure: "not-started" })),
	Match.when(a(NoReview), (): Answer => ({ failure: "no-review" })),
	Match.exhaustive,
);

export type { Answer };
export { failureAnswer, statusAnswer };
