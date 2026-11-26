import { Effect } from "effect";
import type { ReviewStore } from "../../../domain/review.ts";
import { nothingStored } from "../../../perimeters/memory.ts";

const memoryStore: ReviewStore = {
	save: (_workdir, review) => Effect.succeed(review),
	inWorkdir: () => Effect.fail(nothingStored()),
	ofProbe: () => Effect.fail(nothingStored()),
	append: () => Effect.fail(nothingStored()),
};

export { memoryStore };
