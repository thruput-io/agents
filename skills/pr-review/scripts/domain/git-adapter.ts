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
import type { SnapshotDirectory } from "./snapshot-directory.ts";
import { hydrateSnapshot } from "./snapshot-hydration.ts";

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
		snapshotDir.git(["init", "--quiet"]);
		snapshotDir.git(["fetch", "--quiet", "--no-tags", repository, base]);
		const baseCommit = snapshotDir.git(["rev-parse", "FETCH_HEAD"]).trim();
		snapshotDir.git(["fetch", "--quiet", "--no-tags", repository, head]);
		const headCommit = HeadCommitSchema.decode(
			snapshotDir.git(["rev-parse", "FETCH_HEAD"]).trim(),
		);
		const mergeBase = snapshotDir
			.git(["merge-base", baseCommit, headCommit])
			.trim();
		const author = DeveloperSchema.decode(
			snapshotDir.git(["log", "-1", "--format=%ae", headCommit]).trim(),
		);
		const description = PurposeSchema.decode(
			snapshotDir
				.git(["log", "--format=%B", `${mergeBase}..${headCommit}`])
				.trim(),
		);
		const change = ChangeSchema.decode({ host, author, description });
		return hydrateSnapshot(
			this.#review,
			snapshotDir,
			{
				remoteUrl: repository,
				baseRef: base,
				headRef: head,
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
