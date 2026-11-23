import { z } from "zod";
import {
	type ErrorMessage,
	ErrorMessageSchema,
	type Host,
	type HostError,
	HostErrorSchema,
	type Summary,
	SummarySchema,
} from "../domain/contracts.g.ts";
import {
	contentTypeOf,
	type HostHttpResponse,
	type HostTransport,
	HTTP_BAD_REQUEST,
	HTTP_FORBIDDEN,
	HTTP_NON_AUTHORITATIVE,
	HTTP_UNAUTHORIZED,
} from "./http-transport.ts";

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

export { buildBinaryHostError, buildHostError, hostErrorReason };
