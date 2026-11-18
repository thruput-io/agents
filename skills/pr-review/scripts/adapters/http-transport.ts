import { z } from "zod";
import { AccessToken } from "../domain/access-token.ts";
import {
	type ErrorMessage,
	ErrorMessageSchema,
	type Host,
	type HostError,
	HostErrorSchema,
	type Summary,
	SummarySchema,
} from "../domain/contracts.g.ts";
import { isNullOrEmpty } from "../domain/nullish.ts";

const HTTP_OK = 200;
const HTTP_NON_AUTHORITATIVE = 203;
const HTTP_MULTIPLE_CHOICES = 300;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;

interface HostHttpResponse {
	readonly status: number;
	readonly headers: Headers;
	readonly data?: unknown;
}

function contentTypeOf(headers: Headers): string {
	const raw = headers.get("content-type");
	if (isNullOrEmpty(raw)) {
		return "no content-type";
	}
	return raw.toLowerCase();
}

function isJsonResponse<Res extends HostHttpResponse>(
	res: Res,
): res is Extract<Res, { readonly status: 200 }> {
	return (
		res.status >= HTTP_OK &&
		res.status < HTTP_MULTIPLE_CHOICES &&
		res.status !== HTTP_NON_AUTHORITATIVE &&
		contentTypeOf(res.headers).includes("json")
	);
}

function isBinaryResponse(
	res: HostHttpResponse,
): res is HostHttpResponse & { readonly status: 200; readonly data: Blob } {
	const contentType = contentTypeOf(res.headers);
	return (
		res.status >= HTTP_OK &&
		res.status < HTTP_MULTIPLE_CHOICES &&
		res.status !== HTTP_NON_AUTHORITATIVE &&
		res.data instanceof Blob &&
		!contentType.includes("json") &&
		!contentType.includes("html")
	);
}

function hasOauthScope(headers: Headers, accepted: readonly string[]): boolean {
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

interface HostTransport {
	requestInit: () => { readonly headers: Readonly<Record<string, string>> };
	requestInitWithHeaders: (headers: Readonly<Record<string, string>>) => {
		readonly headers: Readonly<Record<string, string>>;
	};
	hasScope: (accepted: readonly string[]) => boolean;
	authGuidance: (envVar: string) => string;
}

function anonymousHttpTransport(): HostTransport {
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

function tokenHttpTransport(token: AccessToken): HostTransport {
	return {
		requestInit: () => token.requestInit(),
		requestInitWithHeaders: (headers) => token.requestInitWithHeaders(headers),
		hasScope: (accepted) => token.hasScope(accepted),
		authGuidance: (envVar) => token.authGuidance(envVar),
	};
}

function transportFromEnv(
	raw: string | undefined,
	normalize: (token: AccessToken) => AccessToken,
): HostTransport {
	if (isNullOrEmpty(raw)) {
		return anonymousHttpTransport();
	}
	const parsed = AccessToken.from(raw);
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
	status === HTTP_NON_AUTHORITATIVE ||
	status === HTTP_UNAUTHORIZED ||
	status === HTTP_FORBIDDEN ||
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
	const contentType = contentTypeOf(res.headers);
	if (isAuthFailure(res.status, contentType)) {
		return SummarySchema.decode(transport.authGuidance(envVar));
	}
	return SummarySchema.decode(`HTTP ${res.status} (${contentType})`);
}

function hostErrorReason(
	hostLabel: string,
	envVar: string,
	res: HostHttpResponse,
	transport: HostTransport,
): Summary {
	const contentType = contentTypeOf(res.headers);
	const formatter = errorFormatterFor(res.data);
	if (isAuthFailure(res.status, contentType)) {
		return formatter.auth(
			hostLabel,
			res.status,
			contentType,
			transport.authGuidance(envVar),
		);
	}
	if (res.status === HTTP_BAD_REQUEST) {
		return formatter.badRequest(hostLabel, contentType);
	}
	return formatter.other(hostLabel, res.status, contentType);
}

const buildHostError = (
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

async function buildBinaryHostError(
	host: Host,
	res: HostHttpResponse,
	transport: HostTransport,
): Promise<HostError> {
	const contentType = contentTypeOf(res.headers);
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

export type { HostHttpResponse, HostTransport };
export {
	anonymousHttpTransport,
	buildBinaryHostError,
	buildHostError,
	HTTP_FORBIDDEN,
	HTTP_MULTIPLE_CHOICES,
	HTTP_NON_AUTHORITATIVE,
	HTTP_OK,
	hasOauthScope,
	hostErrorReason,
	isBinaryResponse,
	isJsonResponse,
	tokenHttpTransport,
	transportFromEnv,
};
