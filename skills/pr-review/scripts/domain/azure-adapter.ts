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
import { AccessToken } from "./access-token.ts";
import {
	type AdapterResolution,
	buildBinaryHostError,
	buildHostError,
	type HostAdapter,
	isBinaryResponse,
	isJsonResponse,
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
import { buildReviewSnapshot } from "./review-snapshot-builder.ts";
import type {
	CommitZipArchive,
	SnapshotDirectory,
} from "./snapshot-directory.ts";

const API_VERSION = { "api-version": "7.1" } as const;
const POLICY_VERSION = "7.1-preview.1";
const AZURE_WRITE_SCOPES = [
	"user_impersonation",
	"vso.code_write",
	"vso.code_full",
	"vso.code_manage",
] as const;

const isWritePermitted = (res: { readonly status: number }): boolean =>
	res.status >= 200 && res.status < 300 && res.status !== 203;

const azureTokenOf = (token: AccessToken): AccessToken =>
	token.isPat() ? token.toBasic() : token;

export class AzureDevOpsAdapter implements HostAdapter<AzureDevOps> {
	readonly #review: AzureMergeRequest;
	readonly #token: AccessToken | null;
	private constructor(review: AzureMergeRequest, token: AccessToken | null) {
		this.#review = review;
		this.#token = token;
	}
	static from(review: AzureMergeRequest): AzureDevOpsAdapter {
		const { AZURE_DEVOPS_EXT_PAT } = process.env;
		const envToken = AccessToken.from(AZURE_DEVOPS_EXT_PAT ?? "");
		return new AzureDevOpsAdapter(
			review,
			envToken.success ? azureTokenOf(envToken.data) : null,
		);
	}
	static fromWithToken(
		review: AzureMergeRequest,
		token: AccessToken,
	): AzureDevOpsAdapter {
		return new AzureDevOpsAdapter(review, azureTokenOf(token));
	}
	host(): AzureDevOps {
		return this.#review.host();
	}
	#prArgs(): readonly [string, string, string, number] {
		const { organization, project, repository, id } = this.host();
		return [organization, project, repository, id];
	}
	#requestInit(): { readonly headers: Readonly<Record<string, string>> } {
		return isNullOrEmpty(this.#token)
			? { headers: { accept: "application/json" } }
			: this.#token.requestInit();
	}
	#hostError(res: {
		readonly status: number;
		readonly headers: Headers;
		readonly data?: unknown;
	}): HostError {
		return buildHostError(this.host(), res, this.#token);
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
		return isWritePermitted(res) ? null : this.#hostError(res);
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
	async #castVote(verdict: Outcome["verdict"]): Promise<HostError | null> {
		const res = await pullRequestReviewersCreatePullRequestReviewer(
			...this.#prArgs(),
			"me",
			votePayload(verdict),
			API_VERSION,
			this.#requestInit(),
		);
		return isWritePermitted(res) ? null : this.#hostError(res);
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
		if (
			!(isNullOrEmpty(this.#token) || this.#token.hasScope(AZURE_WRITE_SCOPES))
		) {
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
		const [evalRes, threadsRes, writeRes] = await Promise.all([
			evaluationsList(host.organization, host.project, policyQuery, init),
			pullRequestThreadsList(...this.#prArgs(), API_VERSION, init),
			pullRequestReviewersUpdatePullRequestReviewers(
				...this.#prArgs(),
				[],
				API_VERSION,
				init,
			),
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
		const evaluations = AzureEvaluationsListCodec.decode(evalRes.data);
		const rawThreads = AzureThreadsListCodec.decode(threadsRes.data);
		const headCommit = headCommitOf(pr);
		const existingRefusal = refusedOf(rawThreads, headCommit);
		const reasons = refusalReasons(
			pr.mergeStatus,
			blockingBuildPolicies(evaluations),
		);
		if (reasons.length > 0) {
			const reason = reasons.join(", ");
			const location = isNullOrEmpty(existingRefusal)
				? await this.#refuse(headCommit, reason)
				: existingRefusal;
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
		const priorCommit = priorOf(rawThreads);
		const commitsToFetch = [
			baseCommit,
			...(isNullOrEmpty(priorCommit) ? [] : [priorCommit]),
			headCommit,
		];
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
			return buildBinaryHostError(host, failedZip.res, this.#token);
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
				priorCommit,
				threads: rawThreads
					.filter((record) => onLines(record) && isOurThread(record))
					.map(thread),
				existingRefusal,
			},
			(commit, reason) => this.#refuse(commit, reason),
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
