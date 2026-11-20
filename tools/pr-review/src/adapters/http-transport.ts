import { AccessToken } from "../domain/access-token.ts";
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

export type { HostHttpResponse, HostTransport };
export {
	anonymousHttpTransport,
	contentTypeOf,
	HTTP_BAD_REQUEST,
	HTTP_FORBIDDEN,
	HTTP_MULTIPLE_CHOICES,
	HTTP_NON_AUTHORITATIVE,
	HTTP_OK,
	HTTP_UNAUTHORIZED,
	hasOauthScope,
	isBinaryResponse,
	isJsonResponse,
	tokenHttpTransport,
	transportFromEnv,
};
