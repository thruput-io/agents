import type { AccessToken } from "./access-token.ts";
import {
	type AlreadyReviewed,
	type Change,
	type ErrorMessage,
	ErrorMessageSchema,
	type HeadCommit,
	type Host,
	type HostError,
	HostErrorSchema,
	type Ledger,
	type Outcome,
	type Refused,
	type Summary,
	SummarySchema,
	type Thread,
	type TooLarge,
} from "./contracts.g.ts";
import { isNullOrEmpty } from "./nullish.ts";
import type { CodeUnderReviewSnapshot } from "./review-snapshot.ts";
import type { SnapshotDirectory } from "./snapshot-directory.ts";

export interface HostHttpResponse {
	readonly status: number;
	readonly headers: Headers;
	readonly data?: unknown;
}

export function isJsonResponse<Res extends HostHttpResponse>(
	res: Res,
): res is Extract<Res, { readonly status: 200 }> {
	return (
		res.status >= 200 &&
		res.status < 300 &&
		res.status !== 203 &&
		(res.headers.get("content-type") ?? "").toLowerCase().includes("json")
	);
}

export function isBinaryResponse(
	res: HostHttpResponse,
): res is HostHttpResponse & { readonly status: 200; readonly data: Blob } {
	const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
	return (
		res.status >= 200 &&
		res.status < 300 &&
		res.status !== 203 &&
		res.data instanceof Blob &&
		!contentType.includes("json") &&
		!contentType.includes("html")
	);
}

export function hasOAuthScope(
	headers: Headers,
	accepted: readonly string[],
): boolean {
	const raw = headers.get("x-oauth-scopes");
	if (isNullOrEmpty(raw) && raw !== "") {
		return true;
	}
	const granted = raw
		.split(",")
		.map((scope) => scope.trim())
		.filter((scope) => scope.length > 0);
	return accepted.some((scope) => granted.includes(scope));
}

const extractErrorMessage = (data: unknown): ErrorMessage | null => {
	if (typeof data !== "object" || isNullOrEmpty(data) || !("message" in data)) {
		return null;
	}
	const parsed = ErrorMessageSchema.safeParse(data.message);
	return parsed.success ? parsed.data : null;
};

function hostErrorMessage(
	envVar: string,
	res: HostHttpResponse,
	token: AccessToken | null,
): Summary {
	const payloadMessage = extractErrorMessage(res.data);
	if (!isNullOrEmpty(payloadMessage)) {
		return payloadMessage;
	}
	const contentType =
		(res.headers.get("content-type") ?? "").toLowerCase() || "no content-type";
	const isAuthFailure =
		res.status === 203 ||
		res.status === 401 ||
		res.status === 403 ||
		!contentType.includes("json");
	if (isAuthFailure) {
		const guidance = isNullOrEmpty(token)
			? `authentication required (set ${envVar} or pass AccessToken.from(...) to prepareWithToken)`
			: `access denied for ${token.kind()} token (verify ${envVar} or AccessToken permissions)`;
		return SummarySchema.decode(guidance);
	}
	return SummarySchema.decode(`HTTP ${res.status} (${contentType})`);
}

export function hostErrorReason(
	hostLabel: string,
	envVar: string,
	res: HostHttpResponse,
	token: AccessToken | null,
): Summary {
	const contentType =
		(res.headers.get("content-type") ?? "").toLowerCase() || "no content-type";
	const payloadMessage = extractErrorMessage(res.data);
	const isAuthFailure =
		res.status === 203 ||
		res.status === 401 ||
		res.status === 403 ||
		!contentType.includes("json");
	if (!isAuthFailure) {
		if (res.status === 400) {
			const detail = isNullOrEmpty(payloadMessage)
				? ": pull request is not writeable. Review must halt."
				: `: pull request is not writeable (${payloadMessage}). Review must halt.`;
			return SummarySchema.decode(
				`${hostLabel} returned HTTP 400 (${contentType})${detail}`,
			);
		}
		const detail = isNullOrEmpty(payloadMessage) ? "." : `: ${payloadMessage}`;
		return SummarySchema.decode(
			`${hostLabel} returned HTTP ${res.status} (${contentType})${detail}`,
		);
	}
	const guidance = isNullOrEmpty(token)
		? `authentication required (set ${envVar} or pass AccessToken.from(...) to prepareWithToken)`
		: `access denied for ${token.kind()} token (verify ${envVar} or AccessToken permissions)`;
	const detail = isNullOrEmpty(payloadMessage) ? "" : ` (${payloadMessage})`;
	return SummarySchema.decode(
		`${hostLabel} returned HTTP ${res.status} (${contentType}): ${guidance}${detail}.`,
	);
}

export const buildHostError = (
	host: Host,
	res: HostHttpResponse,
	token: AccessToken | null,
): HostError => {
	const hostLabel = host.kind === "azure-devops" ? "Azure DevOps" : "GitHub";
	const envVar =
		host.kind === "azure-devops" ? "AZURE_DEVOPS_EXT_PAT" : "GH_TOKEN";
	return HostErrorSchema.decode({
		kind: "host-error",
		host,
		status: res.status,
		message: hostErrorMessage(envVar, res, token),
		reason: hostErrorReason(hostLabel, envVar, res, token),
	});
};

export async function buildBinaryHostError(
	host: Host,
	res: HostHttpResponse,
	token: AccessToken | null,
): Promise<HostError> {
	const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
	if (res.data instanceof Blob && contentType.includes("json")) {
		const text = await res.data.text();
		return buildHostError(
			host,
			{ status: res.status, headers: res.headers, data: JSON.parse(text) },
			token,
		);
	}
	return buildHostError(host, res, token);
}

export type AdapterResolution =
	| {
			readonly kind: "ready";
			readonly headCommit: HeadCommit;
			readonly change: Change;
			readonly snapshot: CodeUnderReviewSnapshot;
	  }
	| AlreadyReviewed
	| TooLarge
	| Refused
	| HostError;

export interface ReviewSnapshotInput {
	readonly baseCommit: HeadCommit;
	readonly headCommit: HeadCommit;
	readonly change: Change;
	readonly priorCommit: HeadCommit | null;
	readonly threads: readonly Thread[];
	readonly existingRefusal: Summary | null;
}

export interface HostAdapter<HostType extends Host = Host> {
	host: () => HostType;
	resolve: (snapshotDir: SnapshotDirectory) => Promise<AdapterResolution>;
	post: (outcome: Outcome, ledger: Ledger) => Promise<Summary | HostError>;
}
