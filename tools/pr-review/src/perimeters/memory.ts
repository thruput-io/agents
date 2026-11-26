import { NoReview } from "../generated/domain/no-review.g.ts";

const nothingStored = (): NoReview => NoReview.create();

export { nothingStored };
