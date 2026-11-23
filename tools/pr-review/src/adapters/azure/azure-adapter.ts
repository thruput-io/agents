import { env } from "node:process";
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
import type { SnapshotPort } from "../../domain/ports.ts";
import {
	pullRequestReviewersUpdatePullRequestReviewers,
	pullRequestsGetPullRequest,
	pullRequestThreadsList,
} from "../../generated/azure/azure-git.g.ts";
import { evaluationsList } from "../../generated/azure/azure-policy.g.ts";
import { buildHostError } from "../http-error.ts";
import {
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
} from "./azure.ts";
import {
	type AzurePostContext,
	isWritePermitted,
	resolveAzureReviewerId,
} from "./azure-client.ts";
import type { AzureMergeRequest } from "./azure-merge-request.ts";
import { postAzureReview } from "./azure-post.ts";
import { finalizeAzureResolution } from "./azure-resolve.ts";
import { AzureThreadsListCodec } from "./azure-threads.ts";

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
	async resolve(snapshotDir: SnapshotPort): Promise<AdapterResolution> {
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
		return finalizeAzureResolution({
			host,
			review: this.#review,
			transport: this.#transport,
			ctx: this.#postContext(),
			snapshotDir,
			pr,
			evaluations: AzureEvaluationsListCodec.decode(evalRes.data),
			rawThreads: AzureThreadsListCodec.decode(threadsRes.data),
			reviewerId,
		});
	}
	async post(outcome: Outcome, ledger: Ledger): Promise<Summary | HostError> {
		const reviewerId = await this.#ensureReviewerId();
		if (typeof reviewerId !== "string") {
			return reviewerId;
		}
		return postAzureReview(this.#postContext(), reviewerId, outcome, ledger);
	}
}
