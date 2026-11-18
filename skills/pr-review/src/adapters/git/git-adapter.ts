import {
	ChangeSchema,
	DeveloperSchema,
	type Git,
	HeadCommitSchema,
	type Ledger,
	type Outcome,
	PurposeSchema,
	type Summary,
} from "../../domain/contracts.g.ts";
import type {
	AdapterResolution,
	HostAdapter,
} from "../../domain/host-adapter.ts";
import { table } from "../../domain/ledger-table.ts";
import { rendered } from "../../domain/outcome.ts";
import type { SnapshotPort } from "../../domain/ports.ts";
import { reviewBaselineFrom } from "../../domain/review-baseline.ts";
import { buildReviewSnapshot } from "../../domain/review-snapshot-builder.ts";
import type { GitDiff } from "./git-diff.ts";

export class GitAdapter implements HostAdapter<Git> {
	readonly #review: GitDiff;
	private constructor(review: GitDiff) {
		this.#review = review;
	}
	static from(review: GitDiff): GitAdapter {
		return new GitAdapter(review);
	}
	host(): Git {
		return this.#review.host();
	}
	resolve(snapshotDir: SnapshotPort): Promise<AdapterResolution> {
		const host = this.host();
		const { repository, base, head } = host;
		snapshotDir.clone(repository);
		const baseCommit = snapshotDir.resolveRef(base);
		const headCommit = HeadCommitSchema.decode(snapshotDir.resolveRef(head));
		snapshotDir.git(["checkout", "--quiet", "--detach", headCommit]);
		const mergeBase = HeadCommitSchema.decode(
			snapshotDir.git(["merge-base", baseCommit, headCommit]).trim(),
		);
		const author = DeveloperSchema.decode(
			snapshotDir.git(["log", "-1", "--format=%ae", headCommit]).trim(),
		);
		const description = PurposeSchema.decode(
			snapshotDir
				.git(["log", "--format=%B", `${mergeBase}..${headCommit}`])
				.trim(),
		);
		const change = ChangeSchema.decode({ host, author, description });
		return buildReviewSnapshot(
			this.#review,
			snapshotDir,
			{
				baseCommit: mergeBase,
				headCommit,
				change,
				baseline: reviewBaselineFrom(null),
				threads: [],
			},
			(commit, reason) =>
				Promise.resolve(`Refusing review at ${commit}: ${reason}`),
		);
	}
	post(outcome: Outcome, ledger: Ledger): Promise<Summary> {
		this.#review.host();
		return Promise.resolve(rendered(outcome, table(ledger)));
	}
}
