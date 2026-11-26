import { NoReview } from "../generated/domain/no-review.g.ts";
import { Workdir } from "../generated/domain/workdir.g.ts";

const keyOf = (workdir: Workdir): string => Workdir.dataOf(workdir);

const nothingStored = (): NoReview => NoReview.create();

export { keyOf, nothingStored };
