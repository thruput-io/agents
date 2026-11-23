import { ResultAsync } from "neverthrow";
import type {
	Change,
	NotReviewable,
	Prepared,
	Probes,
	Review,
	TargetUrl,
	Workdir,
} from "./domain.ts";

interface NeverthrowPorts {
	readonly getChange: (url: TargetUrl) => ResultAsync<Change, NotReviewable>;
	readonly probes: () => ResultAsync<Probes, never>;
	readonly save: (workdir: Workdir, review: Review) => ResultAsync<void, never>;
}

const prepareWithNeverthrow = (
	ports: NeverthrowPorts,
	url: TargetUrl,
	workdir: Workdir,
): ResultAsync<Prepared, NotReviewable> =>
	ResultAsync.combine([ports.getChange(url), ports.probes()]).andThen(
		([change, probes]) => {
			const review = change.reviewWith(probes);

			return ports.save(workdir, review).map(() => review.prepared());
		},
	);

export type { NeverthrowPorts };
export { prepareWithNeverthrow };
