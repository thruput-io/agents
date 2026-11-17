import { z } from "zod";
import {
	type GitPullRequestCommentThread,
	itemsList,
	pullRequestReviewersCreatePullRequestReviewer,
	pullRequestReviewersUpdatePullRequestReviewers,
	pullRequestsGetPullRequest,
	pullRequestThreadsCreate,
	pullRequestThreadsList,
	pullRequestThreadsUpdate,
} from "../../clients/azure-git.g.ts";
import { evaluationsList } from "../../clients/azure-policy.g.ts";
import type { AccessToken } from "./access-token.ts";
import {
	type AdapterResolution,
	buildBinaryHostError,
	buildHostError,
	type HostAdapter,
	type HostTransport,
	isBinaryResponse,
	isJsonResponse,
	tokenHttpTransport,
	transportFromEnv,
} from "./adapter.ts";
import {
	AzureCreatedThreadIdCodec,
	AzureEvaluationsListCodec,
	AzurePullRequestCodec,
	artifactIdOf,
	blockingBuildPolicies,
	changeOf,
	headCommitOf,
	refusalReasons,
	targetCommitOf,
} from "./azure.ts";
import {
	type AzureEditableThreadStatus,
	refusalText,
	text,
	threadPayload,
	threadStatusPayload,
	votePayload,
} from "./azure-review.ts";
import {
	AzureThreadsListCodec,
	isOurThread,
	onLines,
	priorOf,
	refusedOf,
	staleRefusals,
	thread,
	unposted,
} from "./azure-threads.ts";
import type { AzureMergeRequest } from "./code-under-review.ts";
import type {
	AzureDevOps,
	HeadCommit,
	HostError,
	Ledger,
	Outcome,
	Summary,
	ThreadId,
} from "./contracts.g.ts";
import { table } from "./ledger-table.ts";
import { isNullOrEmpty } from "./nullish.ts";
import { refusalRecorder, reviewBaselineFrom } from "./review-baseline.ts";
import { buildReviewSnapshot } from "./review-snapshot-builder.ts";
import type {
	CommitZipArchive,
	SnapshotDirectory,
} from "./snapshot-directory.ts";

const API_VERSION = { "api-version": "7.1" } as const;
const POLICY_VERSION = "7.1-preview.1";
const CONNECTION_DATA_VERSION = "7.1-preview.1";
const ConnectionDataSchema = z.object({
	authenticatedUser: z.object({ id: z.string().min(1) }),
});
const AZURE_WRITE_SCOPES = [
	"user_impersonation",
	"vso.code_write",
	"vso.code_full",
	"vso.code_manage",
] as const;

const isWritePermitted = (res: { readonly status: number }): boolean =>
	res.status >= 200 && res.status < 300 && res.status !== 203;

export class AzureDevOpsAdapter implements HostAdapter<AzureDevOps> {
	readonly #review: AzureMergeRequest;
	readonly #transport: HostTransport;
	#reviewerId: string | null = null;
	private constructor(review: AzureMergeRequest, transport: HostTransport) {
		this.#review = review;
		this.#transport = transport;
	}
	static from(review: AzureMergeRequest): AzureDevOpsAdapter {
		const { AZURE_DEVOPS_EXT_PAT } = process.env;
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
	#requestInit(): { readonly headers: Readonly<Record<string, string>> } {
		return this.#transport.requestInit();
	}
	#hostError(res: {
		readonly status: number;
		readonly headers: Headers;
		readonly data?: unknown;
	}): HostError {
		return buildHostError(this.host(), res, this.#transport);
	}
	#writeResult(res: {
		readonly status: number;
		readonly headers: Headers;
		readonly data?: unknown;
	}): HostError | null {
		if (isWritePermitted(res)) {
			return null;
		}
		return this.#hostError(res);
	}
	async #setStatus(
		tid: ThreadId,
		status: AzureEditableThreadStatus,
	): Promise<HostError | null> {
		const res = await pullRequestThreadsUpdate(
			...this.#prArgs(),
			Number(tid),
			threadStatusPayload(status),
			API_VERSION,
			this.#requestInit(),
		);
		return this.#writeResult(res);
	}
	async #createThread(
		payload: GitPullRequestCommentThread,
	): Promise<Summary | HostError> {
		const res = await pullRequestThreadsCreate(
			...this.#prArgs(),
			payload,
			API_VERSION,
			this.#requestInit(),
		);
		if (!isJsonResponse(res)) {
			return this.#hostError(res);
		}
		return AzureCreatedThreadIdCodec.decode(res.data);
	}
	async #resolveReviewerId(): Promise<string | HostError> {
		if (!isNullOrEmpty(this.#reviewerId)) {
			return this.#reviewerId;
		}
		const url = `https://dev.azure.com/${encodeURIComponent(this.host().organization)}/_apis/connectionData?api-version=${CONNECTION_DATA_VERSION}`;
		const res = await fetch(url, this.#requestInit());
		const data: unknown = await res.json().catch(() => null);
		const httpRes = { status: res.status, headers: res.headers, data };
		if (!isJsonResponse(httpRes)) {
			return this.#hostError(httpRes);
		}
		const parsed = ConnectionDataSchema.safeParse(data);
		if (!parsed.success) {
			return this.#hostError(httpRes);
		}
		this.#reviewerId = parsed.data.authenticatedUser.id;
		return this.#reviewerId;
	}
	async #castVote(verdict: Outcome["verdict"]): Promise<HostError | null> {
		const reviewerId = await this.#resolveReviewerId();
		if (typeof reviewerId !== "string") {
			return reviewerId;
		}
		const res = await pullRequestReviewersCreatePullRequestReviewer(
			...this.#prArgs(),
			reviewerId,
			votePayload(verdict),
			API_VERSION,
			this.#requestInit(),
		);
		return this.#writeResult(res);
	}
	async #refuse(
		headCommit: HeadCommit,
		reason: Summary,
	): Promise<Summary | HostError> {
		const threadId = await this.#createThread(refusalText(headCommit, reason));
		if (typeof threadId !== "string") {
			return threadId;
		}
		const voteErr = await this.#castVote("request-changes");
		if (!isNullOrEmpty(voteErr)) {
			return voteErr;
		}
		return threadId;
	}
	async resolve(snapshotDir: SnapshotDirectory): Promise<AdapterResolution> {
		const host = this.host();
		if (!this.#transport.hasScope(AZURE_WRITE_SCOPES)) {
			return this.#hostError({
				status: 403,
				headers: new Headers({ "content-type": "application/json" }),
				data: {
					message:
						"Access token is missing required Azure DevOps write scope (vso.code_write).",
				},
			});
		}
		const init = this.#requestInit();
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
			this.#resolveReviewerId(),
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
		const evaluations = AzureEvaluationsListCodec.decode(evalRes.data);
		const rawThreads = AzureThreadsListCodec.decode(threadsRes.data);
		const headCommit = headCommitOf(pr);
		const existingRefusal = refusedOf(rawThreads, headCommit);
		const refuse = refusalRecorder(existingRefusal, (commit, reason) =>
			this.#refuse(commit, reason),
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
			staleRefusals(rawThreads).map((tid) => this.#setStatus(tid, "closed")),
		);
		const staleError = staleResults.find((err) => !isNullOrEmpty(err));
		if (!isNullOrEmpty(staleError)) {
			return staleError;
		}
		const baseCommit = targetCommitOf(pr);
		const baseline = reviewBaselineFrom(priorOf(rawThreads));
		const commitsToFetch = baseline.commitsToFetch(baseCommit, headCommit);
		const zipResponses = await Promise.all(
			commitsToFetch.map(async (sha) => ({
				sha,
				res: await itemsList(
					host.organization,
					host.project,
					host.repository,
					{
						scopePath: "/",
						recursionLevel: "full",
						$format: "zip",
						"versionDescriptor.version": sha,
						"versionDescriptor.versionType": "commit",
						zipForUnix: true,
						...API_VERSION,
					},
					init,
				),
			})),
		);
		const failedZip = zipResponses.find(({ res }) => !isBinaryResponse(res));
		if (!isNullOrEmpty(failedZip)) {
			return buildBinaryHostError(host, failedZip.res, this.#transport);
		}
		const zipArchives: CommitZipArchive[] = zipResponses.map(
			({ sha, res }) => ({
				sha,
				zip: res.data,
			}),
		);
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
		const res = await pullRequestThreadsList(
			...this.#prArgs(),
			API_VERSION,
			this.#requestInit(),
		);
		if (!isJsonResponse(res)) {
			return this.#hostError(res);
		}
		const rawThreads = AzureThreadsListCodec.decode(res.data);
		const pending = unposted(outcome, rawThreads);
		const inlineResults = await Promise.all(
			pending.inline.map((f) => this.#createThread(threadPayload(f))),
		);
		const inlineError = inlineResults.find(
			(item): item is HostError => typeof item !== "string",
		);
		if (!isNullOrEmpty(inlineError)) {
			return inlineError;
		}
		const statusResults = await Promise.all([
			...pending.settle.map((id) => this.#setStatus(id, "closed")),
			...outcome.reopen.map((id) => this.#setStatus(id, "active")),
		]);
		const statusError = statusResults.find((err) => !isNullOrEmpty(err));
		if (!isNullOrEmpty(statusError)) {
			return statusError;
		}
		const body = text([outcome.summary, table(ledger)].join("\n\n"));
		const summaryId = pending.summary
			? await this.#createThread(body)
			: String(this.host().id);
		if (typeof summaryId !== "string") {
			return summaryId;
		}
		const voteErr = await this.#castVote(outcome.verdict);
		if (!isNullOrEmpty(voteErr)) {
			return voteErr;
		}
		return summaryId;
	}
}
