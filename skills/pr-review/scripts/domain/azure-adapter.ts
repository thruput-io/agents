import { AccessToken } from "./access-token.ts";
import type { AdapterResolution, HostAdapter } from "./adapter.ts";
import {
	blockingBuildPolicies,
	changeOf,
	headCommitOf,
	refusalReasons,
	remoteUrlOf,
} from "./azure.ts";
import {
	castAzureVote,
	createAzureThread,
	fetchAzurePullRequestState,
	listAzureThreads,
	refuseAzurePullRequest,
	setAzureThreadStatus,
} from "./azure-client.ts";
import { text, threadPayload } from "./azure-review.ts";
import {
	isOurThread,
	onLines,
	priorOf,
	refusedOf,
	staleRefusals,
	thread,
	unposted,
} from "./azure-threads.ts";
import type { AzureMergeRequest } from "./code-under-review.ts";
import {
	type AzureDevOps,
	type Ledger,
	type Outcome,
	RefSchema,
	type Summary,
	SummarySchema,
} from "./contracts.g.ts";
import { table } from "./ledger-table.ts";
import { isNullOrEmpty } from "./nullish.ts";
import type { SnapshotDirectory } from "./snapshot-directory.ts";
import { hydrateSnapshot } from "./snapshot-hydration.ts";

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
	async resolve(snapshotDir: SnapshotDirectory): Promise<AdapterResolution> {
		const host = this.host();
		const state = await fetchAzurePullRequestState(host, this.#token);
		if (!state.ok) {
			return {
				kind: "host-error",
				host,
				status: state.status,
				reason: state.reason,
			};
		}
		const { pr, evaluations, rawThreads } = state;
		const headCommit = headCommitOf(pr);
		const change = changeOf(host, pr);
		const existingRefusal = refusedOf(rawThreads, headCommit);
		const reasons = refusalReasons(
			pr.mergeStatus,
			blockingBuildPolicies(evaluations),
		);
		if (reasons.length > 0) {
			const reason = reasons.join(", ");
			const location = isNullOrEmpty(existingRefusal)
				? await refuseAzurePullRequest(host, this.#token, headCommit, reason)
				: existingRefusal;
			return { kind: "refused", headCommit, reason, location };
		}
		await Promise.all(
			staleRefusals(rawThreads).map((tid) =>
				setAzureThreadStatus(host, this.#token, tid, "closed"),
			),
		);
		return hydrateSnapshot(
			this.#review,
			snapshotDir,
			{
				remoteUrl: remoteUrlOf(host, pr),
				baseRef: RefSchema.parse(pr.targetRefName ?? ""),
				headRef: headCommit,
				headCommit,
				change,
				priorCommit: priorOf(rawThreads),
				threads: rawThreads
					.filter((record) => onLines(record) && isOurThread(record))
					.map(thread),
				existingRefusal,
			},
			(commit, reason) =>
				refuseAzurePullRequest(host, this.#token, commit, reason),
		);
	}
	async post(outcome: Outcome, ledger: Ledger): Promise<Summary> {
		const host = this.host();
		const rawThreads = await listAzureThreads(host, this.#token);
		const pending = unposted(outcome, rawThreads);
		for (const finding of pending.inline) {
			await createAzureThread(host, this.#token, threadPayload(finding));
		}
		for (const id of pending.settle) {
			await setAzureThreadStatus(host, this.#token, id, "closed");
		}
		for (const id of outcome.reopen) {
			await setAzureThreadStatus(host, this.#token, id, "active");
		}
		const summaryId = pending.summary
			? await createAzureThread(
					host,
					this.#token,
					text([outcome.summary, table(ledger)].join("\n\n")),
				)
			: SummarySchema.parse(String(host.id));
		await castAzureVote(host, this.#token, outcome.verdict);
		return summaryId;
	}
}
