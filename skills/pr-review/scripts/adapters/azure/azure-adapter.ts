import { env } from "node:process";
import {
	pullRequestReviewersUpdatePullRequestReviewers,
	pullRequestsGetPullRequest,
	pullRequestThreadsList,
} from "../../../clients/azure-git.g.ts";
import { evaluationsList } from "../../../clients/azure-policy.g.ts";
import type { AccessToken } from "../../domain/access-token.ts";
import type {
	AzureDevOps,
	HostError,
	Ledger,
	Outcome,
	Summary,
} from "../../domain/contracts.g.ts";
import type {
	AdapterResolution,
	HostAdapter,
} from "../../domain/host-adapter.ts";
import { isNullOrEmpty } from "../../domain/nullish.ts";
import {
	refusalRecorder,
	reviewBaselineFrom,
} from "../../domain/review-baseline.ts";
import { buildReviewSnapshot } from "../../domain/review-snapshot-builder.ts";
import type { SnapshotDirectory } from "../../domain/snapshot-directory.ts";
import {
	buildHostError,
	type HostHttpResponse,
	type HostTransport,
	HTTP_FORBIDDEN,
	isJsonResponse,
	tokenHttpTransport,
	transportFromEnv,
} from "../http-transport.ts";
import {
	AzureEvaluationsListCodec,
	AzurePullRequestCodec,
	artifactIdOf,
	blockingBuildPolicies,
	changeOf,
	headCommitOf,
	refusalReasons,
	targetCommitOf,
} from "./azure.ts";
import type { AzureMergeRequest } from "./azure-merge-request.ts";
import {
	type AzurePostContext,
	isWritePermitted,
	postAzureReview,
	refuseAzureReview,
	resolveAzureReviewerId,
	setAzureThreadStatus,
} from "./azure-post.ts";
import {
	AzureThreadsListCodec,
	isOurThread,
	onLines,
	priorOf,
	refusedOf,
	staleRefusals,
	thread,
} from "./azure-threads.ts";
import { downloadAzureCommitZips } from "./azure-zip.ts";

const API_VERSION = { "api-version": "7.1" } as const;
const POLICY_VERSION = "7.1-preview.1";
const AZURE_WRITE_SCOPES = [
	"user_impersonation",
	"vso.code_write",
	"vso.code_full",
	"vso.code_manage",
] as const;

export class AzureDevOpsAdapter implements HostAdapter<AzureDevOps> {
	readonly #review: AzureMergeRequest;
	readonly #transport: HostTransport;
	private constructor(review: AzureMergeRequest, transport: HostTransport) {
		this.#review = review;
		this.#transport = transport;
	}
	static from(review: AzureMergeRequest): AzureDevOpsAdapter {
		const { AZURE_DEVOPS_EXT_PAT } = env;
		return new AzureDevOpsAdapter(
			review,
			transportFromEnv(AZURE_DEVOPS_EXT_PAT, (token) => token.forAzure()),
		);
	}
	static fromWithToken(
		review: AzureMergeRequest,
		token: AccessToken,
	): AzureDevOpsAdapter {
		return new AzureDevOpsAdapter(review, tokenHttpTransport(token.forAzure()));
	}
	host(): AzureDevOps {
		return this.#review.host();
	}
	#prArgs(): readonly [string, string, string, number] {
		const { organization, project, repository, id } = this.host();
		return [organization, project, repository, id];
	}
	#hostError(res: HostHttpResponse): HostError {
		return buildHostError(this.host(), res, this.#transport);
	}
	#postContext(): AzurePostContext {
		return {
			host: this.host(),
			init: this.#transport.requestInit(),
			onError: (res) => this.#hostError(res),
		};
	}
	#ensureReviewerId(): Promise<string | HostError> {
		return resolveAzureReviewerId(this.#postContext());
	}
	async resolve(snapshotDir: SnapshotDirectory): Promise<AdapterResolution> {
		const host = this.host();
		if (!this.#transport.hasScope(AZURE_WRITE_SCOPES)) {
			return this.#hostError({
				status: HTTP_FORBIDDEN,
				headers: new Headers({ "content-type": "application/json" }),
				data: {
					message:
						"Access token is missing required Azure DevOps write scope (vso.code_write).",
				},
			});
		}
		const init = this.#transport.requestInit();
		const prRes = await pullRequestsGetPullRequest(
			...this.#prArgs(),
			API_VERSION,
			init,
		);
		if (!isJsonResponse(prRes)) {
			return this.#hostError(prRes);
		}
		const pr = AzurePullRequestCodec.decode(prRes.data);
		const policyQuery = {
			artifactId: artifactIdOf(host, pr),
			"api-version": POLICY_VERSION,
		};
		const [evalRes, threadsRes, writeRes, reviewerId] = await Promise.all([
			evaluationsList(host.organization, host.project, policyQuery, init),
			pullRequestThreadsList(...this.#prArgs(), API_VERSION, init),
			pullRequestReviewersUpdatePullRequestReviewers(
				...this.#prArgs(),
				[],
				API_VERSION,
				init,
			),
			this.#ensureReviewerId(),
		]);
		if (!isJsonResponse(evalRes)) {
			return this.#hostError(evalRes);
		}
		if (!isJsonResponse(threadsRes)) {
			return this.#hostError(threadsRes);
		}
		if (!isWritePermitted(writeRes)) {
			return this.#hostError(writeRes);
		}
		if (typeof reviewerId !== "string") {
			return reviewerId;
		}
		return this.#finalizeResolution({
			snapshotDir,
			pr,
			evaluations: AzureEvaluationsListCodec.decode(evalRes.data),
			rawThreads: AzureThreadsListCodec.decode(threadsRes.data),
			reviewerId,
		});
	}
	async #finalizeResolution(input: {
		readonly snapshotDir: SnapshotDirectory;
		readonly pr: ReturnType<typeof AzurePullRequestCodec.decode>;
		readonly evaluations: ReturnType<typeof AzureEvaluationsListCodec.decode>;
		readonly rawThreads: ReturnType<typeof AzureThreadsListCodec.decode>;
		readonly reviewerId: string;
	}): Promise<AdapterResolution> {
		const { snapshotDir, pr, evaluations, rawThreads, reviewerId } = input;
		const host = this.host();
		const headCommit = headCommitOf(pr);
		const ctx = this.#postContext();
		const refuse = refusalRecorder(refusedOf(rawThreads, headCommit), (c, r) =>
			refuseAzureReview(ctx, reviewerId, c, r),
		);
		const reasons = refusalReasons(
			pr.mergeStatus,
			blockingBuildPolicies(evaluations),
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
			staleRefusals(rawThreads).map((tid) =>
				setAzureThreadStatus(ctx, tid, "closed"),
			),
		);
		const staleError = staleResults.find((err) => !isNullOrEmpty(err));
		if (!isNullOrEmpty(staleError)) {
			return staleError;
		}
		const baseCommit = targetCommitOf(pr);
		const baseline = reviewBaselineFrom(priorOf(rawThreads));
		const zipArchives = await downloadAzureCommitZips({
			host,
			commits: baseline.commitsToFetch(baseCommit, headCommit),
			init: ctx.init,
			transport: this.#transport,
		});
		if (!Array.isArray(zipArchives)) {
			return zipArchives;
		}
		await snapshotDir.loadCommitZips(zipArchives, false);
		return buildReviewSnapshot(
			this.#review,
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
	async post(outcome: Outcome, ledger: Ledger): Promise<Summary | HostError> {
		const reviewerId = await this.#ensureReviewerId();
		if (typeof reviewerId !== "string") {
			return reviewerId;
		}
		return postAzureReview(this.#postContext(), reviewerId, outcome, ledger);
	}
}
