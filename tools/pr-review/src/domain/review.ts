import type { Either } from "./either.ts";

declare const targetUrlMark: unique symbol;
declare const workdirMark: unique symbol;
declare const probesMark: unique symbol;
declare const preparedMark: unique symbol;
declare const reviewStatusMark: unique symbol;
declare const instantMark: unique symbol;

interface TargetUrl {
	readonly [targetUrlMark]: never;
}

interface Workdir {
	readonly [workdirMark]: never;
}

interface Probes {
	readonly [probesMark]: never;
}

interface Prepared {
	readonly [preparedMark]: never;
}

interface ReviewStatus {
	readonly [reviewStatusMark]: never;
}

interface Instant {
	readonly [instantMark]: never;
}

interface Review {
	prepared: () => Prepared;
	statusAt: (instant: Instant) => ReviewStatus;
}

declare const changeMark: unique symbol;
declare const unknownFormatMark: unique symbol;
declare const alreadyReviewedMark: unique symbol;
declare const tooLargeMark: unique symbol;
declare const refusedMark: unique symbol;
declare const hostErrorMark: unique symbol;

interface Change {
	readonly [changeMark]: never;
	reviewWith: (probes: Probes) => Review;
}

interface UnknownFormat {
	readonly [unknownFormatMark]: never;
}

interface AlreadyReviewed {
	readonly [alreadyReviewedMark]: never;
}

interface TooLarge {
	readonly [tooLargeMark]: never;
}

interface Refused {
	readonly [refusedMark]: never;
}

interface HostError {
	readonly [hostErrorMark]: never;
}

type NotReviewable =
	| UnknownFormat
	| AlreadyReviewed
	| TooLarge
	| Refused
	| HostError;

type Resolution = Either<NotReviewable, Change>;

export type {
	Change,
	Instant,
	NotReviewable,
	Prepared,
	Probes,
	Refused,
	Resolution,
	Review,
	ReviewStatus,
	TargetUrl,
	Workdir,
};
