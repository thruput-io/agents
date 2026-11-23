import * as Effect from "effect/Effect";
import type {
	Change,
	NotReviewable,
	Prepared,
	Probes,
	Review,
	TargetUrl,
	Workdir,
} from "./domain.ts";

interface EffectPorts {
	readonly getChange: (url: TargetUrl) => Effect.Effect<Change, NotReviewable>;
	readonly probes: () => Effect.Effect<Probes>;
	readonly save: (workdir: Workdir, review: Review) => Effect.Effect<void>;
}

const prepareWithEffect = (
	ports: EffectPorts,
	url: TargetUrl,
	workdir: Workdir,
): Effect.Effect<Prepared, NotReviewable> =>
	Effect.gen(function* () {
		const [change, probes] = yield* Effect.all([
			ports.getChange(url),
			ports.probes(),
		]);
		const review = change.reviewWith(probes);

		yield* ports.save(workdir, review);

		return review.prepared();
	});

export type { EffectPorts };
export { prepareWithEffect };
