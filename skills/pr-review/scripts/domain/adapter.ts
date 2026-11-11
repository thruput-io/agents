import type { AccessToken } from "./access-token.ts";
import {
	type Change,
	type HeadCommit,
	type Host,
	type Ledger,
	type Outcome,
	type Path,
	type Ref,
	type RepositoryPath,
	type Summary,
	SummarySchema,
	type Thread,
} from "./contracts.g.ts";
import { isNullOrEmpty } from "./nullish.ts";
import type { CodeUnderReviewSnapshot } from "./review-snapshot.ts";
import type { SnapshotDirectory } from "./snapshot-directory.ts";

export function isJsonResponse<
	Res extends { readonly status: number; readonly headers: Headers },
>(res: Res): res is Extract<Res, { readonly status: 200 }> {
	return (
		res.status >= 200 &&
		res.status < 300 &&
		res.status !== 203 &&
		(res.headers.get("content-type") ?? "").toLowerCase().includes("json")
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
		return SummarySchema.decode(
			`${hostLabel} returned HTTP ${res.status} (${contentType}).`,
		);
	}
	const guidance = isNullOrEmpty(token)
		? `authentication required (set ${envVar} or pass AccessToken.from(...) to prepareWithToken)`
		: `access denied for ${token.kind()} token (verify ${envVar} or AccessToken permissions)`;
	return SummarySchema.decode(
		`${hostLabel} returned HTTP ${res.status} (${contentType}): ${guidance}.`,
	);
}

export type AdapterResolution =
	| {
			readonly kind: "ready";
			readonly headCommit: HeadCommit;
			readonly change: Change;
			readonly snapshot: CodeUnderReviewSnapshot;
	  }
	| {
			readonly kind: "already-reviewed";
			readonly headCommit: HeadCommit;
			readonly location: Summary;
	  }
	| {
			readonly kind: "too-large";
			readonly headCommit: HeadCommit;
			readonly files: readonly Path[];
			readonly location: Summary;
	  }
	| {
			readonly kind: "refused";
			readonly headCommit: HeadCommit;
			readonly reason: Summary;
			readonly location: Summary;
	  }
	| {
			readonly kind: "host-error";
			readonly host: Host;
			readonly status: number;
			readonly reason: Summary;
	  };

export interface RemotePullRequest {
	readonly remoteUrl: RepositoryPath;
	readonly baseRef: Ref;
	readonly headRef: Ref;
	readonly headCommit: HeadCommit;
	readonly change: Change;
	readonly priorCommit: HeadCommit | null;
	readonly threads: readonly Thread[];
	readonly existingRefusal: Summary | null;
}

export interface HostAdapter<HostType extends Host = Host> {
	host: () => HostType;
	resolve: (snapshotDir: SnapshotDirectory) => Promise<AdapterResolution>;
	post: (outcome: Outcome, ledger: Ledger) => Promise<Summary>;
}
