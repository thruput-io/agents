declare const targetUrlMark: unique symbol;
declare const workdirMark: unique symbol;
declare const probesMark: unique symbol;
declare const preparedMark: unique symbol;
declare const changeMark: unique symbol;
declare const notReviewableMark: unique symbol;

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

interface Review {
	prepared: () => Prepared;
}

interface Change {
	readonly [changeMark]: never;
	reviewWith: (probes: Probes) => Review;
}

interface NotReviewable {
	readonly [notReviewableMark]: never;
}

export type {
	Change,
	NotReviewable,
	Prepared,
	Probes,
	Review,
	TargetUrl,
	Workdir,
};
