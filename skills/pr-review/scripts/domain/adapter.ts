import { z } from "zod";
import { AccessToken } from "./access-token.ts";
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
import type { ReviewBaseline } from "./review-baseline.ts";
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

export interface HostTransport {
	requestInit: () => { readonly headers: Readonly<Record<string, string>> };
	requestInitWithHeaders: (headers: Readonly<Record<string, string>>) => {
		readonly headers: Readonly<Record<string, string>>;
	};
	hasScope: (accepted: readonly string[]) => boolean;
	authGuidance: (envVar: string) => string;
}

export function anonymousHttpTransport(): HostTransport {
	return {
		requestInit: () => ({ headers: { accept: "application/json" } }),
		requestInitWithHeaders: (headers) => ({
			headers: { accept: "application/json", ...headers },
		}),
		hasScope: (_accepted) => true,
		authGuidance: (envVar) =>
			`authentication required (set ${envVar} or pass AccessToken.from(...) to prepareWithToken)`,
	};
}

export function tokenHttpTransport(token: AccessToken): HostTransport {
	return {
		requestInit: () => token.requestInit(),
		requestInitWithHeaders: (headers) => token.requestInitWithHeaders(headers),
		hasScope: (accepted) => token.hasScope(accepted),
		authGuidance: (envVar) => token.authGuidance(envVar),
	};
}

export function transportFromEnv(
	raw: string | undefined,
	normalize: (token: AccessToken) => AccessToken,
): HostTransport {
	const parsed = AccessToken.from(raw ?? "");
	if (parsed.success) {
		return tokenHttpTransport(normalize(parsed.data));
	}
	return anonymousHttpTransport();
}

interface HttpErrorFormatter {
	auth: (
		hostLabel: string,
		status: number,
		contentType: string,
		guidance: string,
	) => Summary;
	badRequest: (hostLabel: string, contentType: string) => Summary;
	other: (hostLabel: string, status: number, contentType: string) => Summary;
}

const bareHttpErrorFormatter: HttpErrorFormatter = {
	auth: (hostLabel, status, contentType, guidance) =>
		SummarySchema.decode(
			`${hostLabel} returned HTTP ${status} (${contentType}): ${guidance}.`,
		),
	badRequest: (hostLabel, contentType) =>
		SummarySchema.decode(
			`${hostLabel} returned HTTP 400 (${contentType}): pull request is not writeable. Review must halt.`,
		),
	other: (hostLabel, status, contentType) =>
		SummarySchema.decode(
			`${hostLabel} returned HTTP ${status} (${contentType}).`,
		),
};

function messageHttpErrorFormatter(message: ErrorMessage): HttpErrorFormatter {
	return {
		auth: (hostLabel, status, contentType, guidance) =>
			SummarySchema.decode(
				`${hostLabel} returned HTTP ${status} (${contentType}): ${guidance} (${message}).`,
			),
		badRequest: (hostLabel, contentType) =>
			SummarySchema.decode(
				`${hostLabel} returned HTTP 400 (${contentType}): pull request is not writeable (${message}). Review must halt.`,
			),
		other: (hostLabel, status, contentType) =>
			SummarySchema.decode(
				`${hostLabel} returned HTTP ${status} (${contentType}): ${message}`,
			),
	};
}

const ErrorPayloadSchema = z.object({ message: ErrorMessageSchema });

function errorFormatterFor(data: unknown): HttpErrorFormatter {
	const parsed = ErrorPayloadSchema.safeParse(data);
	if (!parsed.success) {
		return bareHttpErrorFormatter;
	}
	return messageHttpErrorFormatter(parsed.data.message);
}

const HOST_INFO: Readonly<
	Record<Host["kind"], { readonly label: string; readonly envVar: string }>
> = {
	"azure-devops": { label: "Azure DevOps", envVar: "AZURE_DEVOPS_EXT_PAT" },
	github: { label: "GitHub", envVar: "GH_TOKEN" },
	git: { label: "Git", envVar: "GH_TOKEN" },
};

const isAuthFailure = (status: number, contentType: string): boolean =>
	status === 203 ||
	status === 401 ||
	status === 403 ||
	!contentType.includes("json");

function hostErrorMessage(
	envVar: string,
	res: HostHttpResponse,
	transport: HostTransport,
): Summary {
	const parsed = ErrorPayloadSchema.safeParse(res.data);
	if (parsed.success) {
		return parsed.data.message;
	}
	const contentType =
		(res.headers.get("content-type") ?? "").toLowerCase() || "no content-type";
	if (isAuthFailure(res.status, contentType)) {
		return SummarySchema.decode(transport.authGuidance(envVar));
	}
	return SummarySchema.decode(`HTTP ${res.status} (${contentType})`);
}

export function hostErrorReason(
	hostLabel: string,
	envVar: string,
	res: HostHttpResponse,
	transport: HostTransport,
): Summary {
	const contentType =
		(res.headers.get("content-type") ?? "").toLowerCase() || "no content-type";
	const formatter = errorFormatterFor(res.data);
	if (isAuthFailure(res.status, contentType)) {
		return formatter.auth(
			hostLabel,
			res.status,
			contentType,
			transport.authGuidance(envVar),
		);
	}
	if (res.status === 400) {
		return formatter.badRequest(hostLabel, contentType);
	}
	return formatter.other(hostLabel, res.status, contentType);
}

export const buildHostError = (
	host: Host,
	res: HostHttpResponse,
	transport: HostTransport,
): HostError => {
	const { label: hostLabel, envVar } = HOST_INFO[host.kind];
	return HostErrorSchema.decode({
		kind: "host-error",
		host,
		status: res.status,
		message: hostErrorMessage(envVar, res, transport),
		reason: hostErrorReason(hostLabel, envVar, res, transport),
	});
};

export async function buildBinaryHostError(
	host: Host,
	res: HostHttpResponse,
	transport: HostTransport,
): Promise<HostError> {
	const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
	if (res.data instanceof Blob && contentType.includes("json")) {
		const text = await res.data.text();
		return buildHostError(
			host,
			{ status: res.status, headers: res.headers, data: JSON.parse(text) },
			transport,
		);
	}
	return buildHostError(host, res, transport);
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
	readonly baseline: ReviewBaseline;
	readonly threads: readonly Thread[];
}

export interface HostAdapter<HostType extends Host = Host> {
	host: () => HostType;
	resolve: (snapshotDir: SnapshotDirectory) => Promise<AdapterResolution>;
	post: (outcome: Outcome, ledger: Ledger) => Promise<Summary | HostError>;
}
