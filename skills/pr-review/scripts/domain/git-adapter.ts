import type { AdapterResolution, HostAdapter } from "./adapter.ts";
import type { GitDiff } from "./code-under-review.ts";
import {
	ChangeSchema,
	DeveloperSchema,
	type Git,
	HeadCommitSchema,
	type Ledger,
	type Outcome,
	PurposeSchema,
	type Summary,
} from "./contracts.g.ts";
import { table } from "./ledger-table.ts";
import { rendered } from "./review-snapshot.ts";
import { buildReviewSnapshot } from "./review-snapshot-builder.ts";
import type { SnapshotDirectory } from "./snapshot-directory.ts";

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
	resolve(snapshotDir: SnapshotDirectory): Promise<AdapterResolution> {
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
				priorCommit: null,
				threads: [],
				existingRefusal: null,
			},
			(commit, reason) =>
				Promise.resolve(`Refusing review at ${commit}: ${reason}`),
		);
	}
	post(outcome: Outcome, ledger: Ledger): Promise<Summary> {
		return Promise.resolve(rendered(outcome, table(ledger)));
	}
}
