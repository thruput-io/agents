import type { AccessToken } from "./access-token.ts";
import { type Summary, SummarySchema } from "./contracts.g.ts";
import { isNullOrEmpty } from "./nullish.ts";

function headersOf(
	raw: RequestInit["headers"],
): Readonly<Record<string, string>> {
	if (isNullOrEmpty(raw)) {
		return {};
	}
	if (raw instanceof Headers) {
		return Object.fromEntries(raw.entries());
	}
	if (Array.isArray(raw)) {
		return Object.fromEntries(
			raw.map((entry) => [String(entry[0]), String(entry[1])]),
		);
	}
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(raw)) {
		if (!isNullOrEmpty(value)) {
			result[key] = String(value);
		}
	}
	return result;
}

const NO_BODY_STATUSES = new Set([204, 205, 304]);

export function isJsonResponse(res: {
	readonly status: number;
	readonly headers: Headers;
}): boolean {
	return (
		res.status >= 200 &&
		res.status < 300 &&
		res.status !== 203 &&
		(res.headers.get("content-type") ?? "").toLowerCase().includes("json")
	);
}

export function hostErrorReason(
	hostLabel: string,
	envVar: string,
	res: { readonly status: number; readonly headers: Headers },
	token: AccessToken | null,
): Summary {
	const contentType =
		(res.headers.get("content-type") ?? "").toLowerCase() || "no content-type";
	const isAuthFailure =
		res.status === 203 ||
		res.status === 401 ||
		res.status === 403 ||
		!contentType.includes("json");
	if (!isAuthFailure) {
		return SummarySchema.parse(
			`${hostLabel} returned HTTP ${res.status} (${contentType}).`,
		);
	}
	const guidance = isNullOrEmpty(token)
		? `authentication required (set ${envVar} or pass AccessToken.from(...) to prepareWithToken)`
		: `access denied for ${token.kind()} token (verify ${envVar} or AccessToken permissions)`;
	return SummarySchema.parse(
		`${hostLabel} returned HTTP ${res.status} (${contentType}): ${guidance}.`,
	);
}

export async function jsonFetch<ResponseType>(
	url: string,
	init: RequestInit,
): Promise<ResponseType> {
	const callerHeaders = headersOf(init.headers);
	const res = await fetch(url, {
		...init,
		headers: {
			accept: "application/json",
			...callerHeaders,
		},
	});
	const body = NO_BODY_STATUSES.has(res.status) ? null : await res.text();
	const trimmed = isNullOrEmpty(body) ? "" : body.trimStart();
	const isJson =
		isJsonResponse(res) && (trimmed.startsWith("{") || trimmed.startsWith("["));
	const data = isJson ? JSON.parse(trimmed) : {};
	return { data, status: res.status, headers: res.headers } as ResponseType;
}
