import { pipe } from "fp-ts/lib/function.js";
import type * as Task from "fp-ts/lib/Task.js";
import * as TaskEither from "fp-ts/lib/TaskEither.js";
import type {
	Change,
	NotReviewable,
	Prepared,
	Probes,
	Review,
	TargetUrl,
	Workdir,
} from "./domain.ts";

interface FpTsPorts {
	readonly getChange: (
		url: TargetUrl,
	) => TaskEither.TaskEither<NotReviewable, Change>;
	readonly probes: () => Task.Task<Probes>;
	readonly save: (workdir: Workdir, review: Review) => Task.Task<void>;
}

const prepareWithFpTs = (
	ports: FpTsPorts,
	url: TargetUrl,
	workdir: Workdir,
): TaskEither.TaskEither<NotReviewable, Prepared> =>
	pipe(
		ports.getChange(url),
		TaskEither.flatMap((change) =>
			pipe(
				TaskEither.fromTask(ports.probes()),
				TaskEither.map((probes) => change.reviewWith(probes)),
			),
		),
		TaskEither.flatMap((review) =>
			pipe(
				TaskEither.fromTask(ports.save(workdir, review)),
				TaskEither.map(() => review.prepared()),
			),
		),
	);

export type { FpTsPorts };
export { prepareWithFpTs };
