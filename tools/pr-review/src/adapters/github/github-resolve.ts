import { GraphQLClient } from "graphql-request";
import type { GithubPullRequest } from "../../domain/code-under-review.ts";
import type {
	GitHub,
	HeadCommit,
	HostError,
} from "../../domain/contracts.g.ts";
import type { AdapterResolution } from "../../domain/host-adapter.ts";
import { isNullOrEmpty } from "../../domain/nullish.ts";
import type { SnapshotPort } from "../../domain/ports.ts";
import {
	refusalRecorder,
	reviewBaselineFrom,
} from "../../domain/review-baseline.ts";
import { buildReviewSnapshot } from "../../domain/review-snapshot-builder.ts";
import {
	checksListForRef,
	pullsListReviews,
} from "../../generated/github/github.g.ts";
import {
	type HostHttpResponse,
	type HostTransport,
	isJsonResponse,
} from "../http-transport.ts";
import {
	baseCommitOf,
	changeOf,
	failedChecks,
	GitHubCheckRunsCodec,
	type GitHubPullRequestCodec,
	GitHubReviewsCodec,
	postedAt,
	priorOf,
	refusalReasons,
	refusedIn,
} from "./github.ts";
import { refuseGitHubReview } from "./github-post.ts";
import { downloadGitHubCommitZips } from "./github-pull-precheck.ts";
import { fetchGitHubThreads } from "./github-threads.ts";

const GRAPHQL_URL = "https://api.github.com/graphql";

interface ResolveGitHubInput {
	readonly host: GitHub;
	readonly review: GithubPullRequest;
	readonly transport: HostTransport;
	readonly hostError: (res: HostHttpResponse) => HostError;
	readonly snapshotDir: SnapshotPort;
	readonly pr: ReturnType<typeof GitHubPullRequestCodec.decode>;
	readonly headCommit: HeadCommit;
	readonly init: ReturnType<HostTransport["requestInit"]>;
}

async function finalizeGitHubResolution(
	input: ResolveGitHubInput & {
		readonly change: ReturnType<typeof changeOf>;
		readonly reviews: ReturnType<typeof GitHubReviewsCodec.decode>;
		readonly checksData: Parameters<typeof GitHubCheckRunsCodec.decode>[0];
		readonly threads: Parameters<typeof buildReviewSnapshot>[2]["threads"];
	},
): Promise<AdapterResolution> {
	const {
		host,
		review,
		transport,
		hostError,
		snapshotDir,
		pr,
		headCommit,
		change,
		init,
		reviews,
		checksData,
		threads,
	} = input;
	const already = postedAt(reviews, headCommit);
	if (!isNullOrEmpty(already)) {
		return { kind: "already-reviewed", headCommit, location: already };
	}
	const refuse = refusalRecorder(refusedIn(reviews, headCommit), (c, msg) =>
		refuseGitHubReview({
			host,
			init,
			headCommit: c,
			reason: msg,
			onError: hostError,
		}),
	);
	const reasons = refusalReasons(
		pr.mergeable_state,
		failedChecks(GitHubCheckRunsCodec.decode(checksData)),
	);
	if (reasons.length > 0) {
		const reason = reasons.join(", ");
		const location = await refuse(headCommit, reason);
		if (typeof location !== "string") {
			return location;
		}
		return { kind: "refused", headCommit, reason, location };
	}
	const baseCommit = baseCommitOf(pr);
	const baseline = reviewBaselineFrom(priorOf(reviews));
	const zipArchives = await downloadGitHubCommitZips({
		host,
		commits: baseline.commitsToFetch(baseCommit, headCommit),
		init,
		token: transport,
	});
	if (!Array.isArray(zipArchives)) {
		return zipArchives;
	}
	await snapshotDir.loadCommitZips(zipArchives, true);
	return buildReviewSnapshot(
		review,
		snapshotDir,
		{ baseCommit, headCommit, change, baseline, threads },
		refuse,
	);
}

async function resolveGitHubSnapshot(
	input: ResolveGitHubInput,
): Promise<AdapterResolution> {
	const { host, hostError, pr, headCommit, init } = input;
	const change = changeOf(host, pr);
	const client = new GraphQLClient(GRAPHQL_URL, init);
	const [checksRes, reviewsRes, threadsRes] = await Promise.all([
		checksListForRef(host.owner, host.repository, headCommit, {}, init),
		pullsListReviews(host.owner, host.repository, host.number, {}, init),
		fetchGitHubThreads(client, host, change.author),
	]);
	if (!isJsonResponse(checksRes)) {
		return hostError(checksRes);
	}
	if (!isJsonResponse(reviewsRes)) {
		return hostError(reviewsRes);
	}
	if (!threadsRes.ok) {
		return hostError(threadsRes);
	}
	if (!threadsRes.viewerCanUpdate) {
		return hostError({
			status: 403,
			headers: new Headers(),
			data: {
				message: "Viewer does not have permission to update pull request.",
			},
		});
	}
	return finalizeGitHubResolution({
		...input,
		change,
		reviews: GitHubReviewsCodec.decode(reviewsRes.data),
		checksData: checksRes.data,
		threads: threadsRes.threads,
	});
}

export { resolveGitHubSnapshot };
