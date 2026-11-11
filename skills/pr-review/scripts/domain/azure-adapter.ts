import {
	type GitPullRequestCommentThread,
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
	type HostAdapter,
	hostErrorReason,
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
	remoteUrlOf,
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
	Ledger,
	Outcome,
	Summary,
	ThreadId,
} from "./contracts.g.ts";
import { table } from "./ledger-table.ts";
import { isNullOrEmpty } from "./nullish.ts";
import type { SnapshotDirectory } from "./snapshot-directory.ts";
import { hydrateSnapshot } from "./snapshot-hydration.ts";

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
	}): AdapterResolution {
		return {
			kind: "host-error",
			host: this.host(),
			status: res.status,
			reason: hostErrorReason(
				"Azure DevOps",
				"AZURE_DEVOPS_EXT_PAT",
				res,
				this.#token,
			),
		};
	}
	async #setStatus(tid: ThreadId, status: AzureEditableThreadStatus) {
		await pullRequestThreadsUpdate(
			...this.#prArgs(),
			Number(tid),
			threadStatusPayload(status),
			API_VERSION,
			this.#requestInit(),
		);
	}
	async #createThread(payload: GitPullRequestCommentThread): Promise<Summary> {
		const res = await pullRequestThreadsCreate(
			...this.#prArgs(),
			payload,
			API_VERSION,
			this.#requestInit(),
		);
		return AzureCreatedThreadIdCodec.decode(res.data);
	}
	async #castVote(verdict: Outcome["verdict"]): Promise<void> {
		await pullRequestReviewersCreatePullRequestReviewer(
			...this.#prArgs(),
			"me",
			votePayload(verdict),
			API_VERSION,
			this.#requestInit(),
		);
	}
	async #refuse(headCommit: HeadCommit, reason: Summary): Promise<Summary> {
		const threadId = await this.#createThread(refusalText(headCommit, reason));
		await this.#castVote("request-changes");
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
			return { kind: "refused", headCommit, reason, location };
		}
		await Promise.all(
			staleRefusals(rawThreads).map((tid) => this.#setStatus(tid, "closed")),
		);
		return hydrateSnapshot(
			this.#review,
			snapshotDir,
			{
				remoteUrl: remoteUrlOf(host, pr),
				baseRef: pr.targetRefName ?? "",
				headRef: pr.sourceRefName ?? headCommit,
				headCommit,
				change: changeOf(host, pr),
				priorCommit: priorOf(rawThreads),
				threads: rawThreads
					.filter((record) => onLines(record) && isOurThread(record))
					.map(thread),
				existingRefusal,
			},
			(commit, reason) => this.#refuse(commit, reason),
		);
	}
	async post(outcome: Outcome, ledger: Ledger): Promise<Summary> {
		const res = await pullRequestThreadsList(
			...this.#prArgs(),
			API_VERSION,
			this.#requestInit(),
		);
		const rawThreads = isJsonResponse(res)
			? AzureThreadsListCodec.decode(res.data)
			: [];
		const pending = unposted(outcome, rawThreads);
		await Promise.all([
			...pending.inline.map((f) => this.#createThread(threadPayload(f))),
			...pending.settle.map((id) => this.#setStatus(id, "closed")),
			...outcome.reopen.map((id) => this.#setStatus(id, "active")),
		]);
		const body = text([outcome.summary, table(ledger)].join("\n\n"));
		const summaryId = pending.summary
			? await this.#createThread(body)
			: String(this.host().id);
		await this.#castVote(outcome.verdict);
		return summaryId;
	}
}
