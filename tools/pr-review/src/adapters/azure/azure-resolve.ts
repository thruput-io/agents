import type { AzureDevOps, HeadCommit } from "../../domain/contracts.g.ts";
import type { AdapterResolution } from "../../domain/host-adapter.ts";
import { isNullOrEmpty } from "../../domain/nullish.ts";
import type { SnapshotPort } from "../../domain/ports.ts";
import {
	type RefusalRecorder,
	refusalRecorder,
	reviewBaselineFrom,
} from "../../domain/review-baseline.ts";
import { buildReviewSnapshot } from "../../domain/review-snapshot-builder.ts";
import type { HostTransport } from "../http-transport.ts";
import {
	type AzureEvaluationsListCodec,
	type AzurePullRequestCodec,
	blockingBuildPolicies,
	changeOf,
	headCommitOf,
	refusalReasons,
	targetCommitOf,
} from "./azure.ts";
import { type AzurePostContext, setAzureThreadStatus } from "./azure-client.ts";
import type { AzureMergeRequest } from "./azure-merge-request.ts";
import { refuseAzureReview } from "./azure-post.ts";
import {
	type AzureThreadsListCodec,
	isOurThread,
	onLines,
	priorOf,
	refusedOf,
	staleRefusals,
	thread,
} from "./azure-threads.ts";
import { downloadAzureCommitZips } from "./azure-zip.ts";

interface AzureResolutionInput {
	readonly host: AzureDevOps;
	readonly review: AzureMergeRequest;
	readonly transport: HostTransport;
	readonly ctx: AzurePostContext;
	readonly snapshotDir: SnapshotPort;
	readonly pr: ReturnType<typeof AzurePullRequestCodec.decode>;
	readonly evaluations: ReturnType<typeof AzureEvaluationsListCodec.decode>;
	readonly rawThreads: ReturnType<typeof AzureThreadsListCodec.decode>;
	readonly reviewerId: string;
}

const resolveAzureBlockers = async (
	input: AzureResolutionInput,
	headCommit: HeadCommit,
	refuse: RefusalRecorder,
): Promise<AdapterResolution | null> => {
	const reasons = refusalReasons(
		input.pr.mergeStatus,
		blockingBuildPolicies(input.evaluations),
	);
	if (reasons.length > 0) {
		const reason = reasons.join(", ");
		const location = await refuse(headCommit, reason);
		if (typeof location !== "string") {
			return location;
		}
		return { kind: "refused", headCommit, reason, location };
	}
	const staleResults = await Promise.all(
		staleRefusals(input.rawThreads).map((tid) =>
			setAzureThreadStatus(input.ctx, tid, "closed"),
		),
	);
	const staleError = staleResults.find((err) => !isNullOrEmpty(err));
	if (!isNullOrEmpty(staleError)) {
		return staleError;
	}
	return null;
};

async function finalizeAzureResolution(
	input: AzureResolutionInput,
): Promise<AdapterResolution> {
	const { host, review, transport, ctx, snapshotDir, pr, rawThreads } = input;
	const headCommit = headCommitOf(pr);
	const refuse = refusalRecorder(refusedOf(rawThreads, headCommit), (c, r) =>
		refuseAzureReview(ctx, input.reviewerId, c, r),
	);
	const blocked = await resolveAzureBlockers(input, headCommit, refuse);
	if (!isNullOrEmpty(blocked)) {
		return blocked;
	}
	const baseCommit = targetCommitOf(pr);
	const baseline = reviewBaselineFrom(priorOf(rawThreads));
	const zipArchives = await downloadAzureCommitZips({
		host,
		commits: baseline.commitsToFetch(baseCommit, headCommit),
		init: ctx.init,
		transport,
	});
	if (!Array.isArray(zipArchives)) {
		return zipArchives;
	}
	await snapshotDir.loadCommitZips(zipArchives, false);
	return buildReviewSnapshot(
		review,
		snapshotDir,
		{
			baseCommit,
			headCommit,
			change: changeOf(host, pr),
			baseline,
			threads: rawThreads
				.filter((record) => onLines(record) && isOurThread(record))
				.map(thread),
		},
		refuse,
	);
}

export { finalizeAzureResolution };
