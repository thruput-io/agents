import { z } from "zod";
import type { AccessToken } from "./access-token.ts";
import {
	AzureMergeRequest,
	type CodeUnderReview,
	GitDiff,
	GithubPullRequest,
	type ReviewState,
} from "./code-under-review.ts";
import type {
	Fragment,
	Host,
	Outcome,
	SurfaceFile,
	Threads,
} from "./contracts.g.ts";
import { TargetSchema } from "./host.ts";
import type { SnapshotDirectory } from "./snapshot-directory.ts";

export class CodeUnderReviewSnapshot implements CodeUnderReview {
	readonly #review: CodeUnderReview;
	readonly #snapShot: SnapshotDirectory;
	private constructor(review: CodeUnderReview, snapShot: SnapshotDirectory) {
		this.#review = review;
		this.#snapShot = snapShot;
	}
	static from(
		review: CodeUnderReview,
		snapShot: SnapshotDirectory,
	): CodeUnderReviewSnapshot {
		return new CodeUnderReviewSnapshot(review, snapShot);
	}
	get snapShot(): SnapshotDirectory {
		return this.#snapShot;
	}
	host(): Host {
		return this.#review.host();
	}
	surface(): readonly SurfaceFile[] {
		return this.#review.surface();
	}
	fragments(): readonly Fragment[] {
		return this.#review.fragments();
	}
	threads(): Threads {
		return this.#review.threads();
	}
	withReview(...state: ReviewState): CodeUnderReviewSnapshot {
		return new CodeUnderReviewSnapshot(
			this.#review.withReview(...state),
			this.#snapShot,
		);
	}
}

const HostReviewSchema = z.union([
	GithubPullRequest.Schema,
	AzureMergeRequest.Schema,
	GitDiff.Schema,
]);
const FactorySchema = TargetSchema.pipe(HostReviewSchema);

export class CodeUnderReviewFactory {
	private constructor() {}
	static from(url: string): z.ZodSafeParseResult<CodeUnderReview> {
		return FactorySchema.safeDecode(url);
	}
	static fromWithToken(
		url: string,
		_token: AccessToken,
	): z.ZodSafeParseResult<CodeUnderReview> {
		return FactorySchema.safeDecode(url);
	}
}

export function rendered(outcome: Outcome, ledgerTable: string): string {
	const findings = outcome.inline.map(
		(finding) =>
			`- \`${finding.path}:${finding.lines.start}-${finding.lines.end}\` (${finding.side}): ${finding.body}`,
	);
	const sections = [
		outcome.summary,
		...(findings.length === 0 ? [] : [findings.join("\n")]),
		ledgerTable,
	];
	return `${sections.join("\n\n")}\n`;
}
