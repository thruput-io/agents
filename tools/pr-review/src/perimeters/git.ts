import { Assignments } from "../domain/assignments.ts";
import { Change } from "../domain/change.ts";
import { PendingReview } from "../domain/pending-review.ts";
import { HostError } from "../generated/domain/host-error.g.ts";
import { ReviewStatus } from "../generated/domain/review-status.g.ts";
import { TargetUrl } from "../generated/domain/target-url.g.ts";

const remoteOf = (url: TargetUrl): string => TargetUrl.codec.encode(url);

const changeOfRemote = (): Change =>
	Change.of(
		PendingReview.of(ReviewStatus.codec.decode({}), Assignments.of([])),
	);

const unreachableRemote = (): HostError => HostError.create();

export { changeOfRemote, remoteOf, unreachableRemote };
