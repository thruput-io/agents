import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as it } from "node:test";
import { AzureMergeRequest } from "../adapters/azure/azure-merge-request.ts";
import { CodeUnderReviewFactory } from "../adapters/code-under-review-factory.ts";
import { GitDiff } from "../adapters/git/git-diff.ts";
import { AccessToken } from "./access-token.ts";
import { GithubPullRequest } from "./code-under-review.ts";
import { parseNumstat } from "./diff.ts";
import { nonnull } from "./nullish.ts";
import { CodeUnderReviewSnapshot, rendered } from "./review-snapshot.ts";
import { SnapshotDirectory } from "./snapshot-directory.ts";

const BINARY_BYTES = [0, 1, 2] as const;
const LINE_WIDTH = 80;
const LARGE_LINE_COUNT = 20_000;
const ONE_MIB = 1_048_576;

it("SnapshotDirectory parses a non-empty path, compares by value, and reads text files while ignoring missing or binary files", () => {
	const dir = SnapshotDirectory.from("/tmp/work/snapshot");
	const same = SnapshotDirectory.from("/tmp/work/snapshot");
	assert.equal(dir.success, true);
	assert.equal(same.success, true);
	assert.equal(dir.data.equals(same.data), true);
	assert.equal(SnapshotDirectory.from("").success, false);

	const tempDir = mkdtempSync(join(tmpdir(), "snapshot-dir-test-"));
	writeFileSync(join(tempDir, "hello.ts"), "const x = 1;\n", "utf8");
	writeFileSync(join(tempDir, "bin.dat"), Buffer.from(BINARY_BYTES));
	const realSnap = SnapshotDirectory.from(tempDir);
	assert.equal(realSnap.success, true);
	assert.equal(realSnap.data.readTextFile("hello.ts"), "const x = 1;\n");
	assert.equal(realSnap.data.readTextFile("missing.ts"), null);
	assert.equal(realSnap.data.readTextFile("bin.dat"), null);
	rmSync(tempDir, { recursive: true, force: true });
});

it("SnapshotDirectory.diff returns diffs larger than Node's 1 MiB default maxBuffer", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "snapshot-diff-buffer-"));
	try {
		const snap = nonnull(SnapshotDirectory.from(tempDir).data);
		snap.git(["init", "--quiet"]);
		snap.git(["config", "user.email", "test@local"]);
		snap.git(["config", "user.name", "test"]);
		writeFileSync(join(tempDir, "big.txt"), "start\n", "utf8");
		snap.git(["add", "big.txt"]);
		snap.git(["commit", "--quiet", "-m", "base"]);
		const baseSha = snap.git(["rev-parse", "HEAD"]);
		const largePayload = `${"x".repeat(LINE_WIDTH)}\n`.repeat(LARGE_LINE_COUNT);
		writeFileSync(join(tempDir, "big.txt"), largePayload, "utf8");
		snap.git(["add", "big.txt"]);
		snap.git(["commit", "--quiet", "-m", "head"]);
		const headSha = snap.git(["rev-parse", "HEAD"]);
		const stats = parseNumstat(snap.numstat(baseSha, headSha));
		assert.deepEqual(stats, [
			{ path: "big.txt", added: LARGE_LINE_COUNT, deleted: 1 },
		]);
		const diffText = snap.diff(baseSha, headSha);
		assert.equal(diffText.length > ONE_MIB, true);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

it("GithubPullRequest exposes its host, surface, fragments, and threads", () => {
	const pr = GithubPullRequest.from({
		kind: "github",
		owner: "thruput-io",
		repository: "agents",
		number: 14,
	});
	assert.equal(pr.success, true);
	assert.deepEqual(pr.data.host(), {
		kind: "github",
		owner: "thruput-io",
		repository: "agents",
		number: 14,
	});
	assert.deepEqual(pr.data.surface(), []);
	assert.deepEqual(pr.data.fragments(), []);
	assert.deepEqual(pr.data.threads(), { threads: [] });
});

it("AzureMergeRequest exposes its host, surface, fragments, and threads", () => {
	const mr = AzureMergeRequest.from({
		kind: "azure-devops",
		organization: "Org",
		project: "Proj",
		repository: "Repo",
		id: 99,
	});
	assert.equal(mr.success, true);
	assert.deepEqual(mr.data.host(), {
		kind: "azure-devops",
		organization: "Org",
		project: "Proj",
		repository: "Repo",
		id: 99,
	});
	assert.deepEqual(mr.data.surface(), []);
	assert.deepEqual(mr.data.fragments(), []);
	assert.deepEqual(mr.data.threads(), { threads: [] });
});

it("GitDiff exposes its host, surface, fragments, and threads", () => {
	const diff = GitDiff.from({
		kind: "git",
		repository: "/repo",
		base: "main",
		head: "HEAD",
	});
	assert.equal(diff.success, true);
	assert.deepEqual(diff.data.host(), {
		kind: "git",
		repository: "/repo",
		base: "main",
		head: "HEAD",
	});
	assert.deepEqual(diff.data.surface(), []);
	assert.deepEqual(diff.data.fragments(), []);
	assert.deepEqual(diff.data.threads(), { threads: [] });
});

it("CodeUnderReviewFactory parses GitHub, Azure DevOps, and Git targets into their concrete classes", () => {
	const gh = CodeUnderReviewFactory.from(
		"https://github.com/thruput-io/agents/pull/14/files#diff-1",
	);
	assert.equal(gh.success, true);
	assert.equal(gh.data instanceof GithubPullRequest, true);
	assert.deepEqual(gh.data.host(), {
		kind: "github",
		owner: "thruput-io",
		repository: "agents",
		number: 14,
	});

	const token = AccessToken.from("ghp_secret");
	assert.equal(token.success, true);
	const az = CodeUnderReviewFactory.fromWithToken(
		"https://dev.azure.com/Org/Proj/_git/Repo/pullrequest/99",
		token.data,
	);
	assert.equal(az.success, true);
	assert.equal(az.data instanceof AzureMergeRequest, true);

	const git = CodeUnderReviewFactory.from("/repo@main..HEAD");
	assert.equal(git.success, true);
	assert.equal(git.data instanceof GitDiff, true);

	assert.equal(
		CodeUnderReviewFactory.from("https://example.com/not-a-pr").success,
		false,
	);
});

it("CodeUnderReviewSnapshot wraps a CodeUnderReview and exposes its SnapshotDirectory", () => {
	const pr = GithubPullRequest.from({
		kind: "github",
		owner: "thruput-io",
		repository: "agents",
		number: 14,
	});
	const dir = SnapshotDirectory.from("/tmp/work/snapshot");
	assert.equal(pr.success, true);
	assert.equal(dir.success, true);
	const snapshot = CodeUnderReviewSnapshot.from(pr.data, dir.data).withReview(
		[
			{
				path: "a.ts",
				fragments: [
					{
						kind: "surface",
						side: "head",
						lines: [
							{
								idToReportViolationOn: "a.ts:1",
								text: "const a = 1;",
							},
						],
					},
				],
			},
		],
		[
			{
				kind: "surface",
				side: "head",
				lines: [
					{
						idToReportViolationOn: "a.ts:1",
						text: "const a = 1;",
					},
				],
			},
		],
		{ threads: [] },
	);
	assert.equal(snapshot.snapShot.equals(dir.data), true);
	assert.deepEqual(snapshot.host(), pr.data.host());
	assert.equal(snapshot.surface().length, 1);
	assert.equal(snapshot.fragments().length, 1);
	assert.deepEqual(snapshot.threads(), { threads: [] });
});

it("rendered writes the review as markdown with summary, inline findings, and ledger", () => {
	const outcome = {
		headCommit: "h",
		verdict: "request-changes" as const,
		summary: "s",
		inline: [
			{
				path: "p",
				side: "head" as const,
				lines: { start: 3, end: 4 },
				body: "r",
			},
		],
		settle: [],
		reopen: [],
	};
	assert.equal(
		rendered(outcome, "| t |"),
		"s\n\n- `p:3-4` (head): r\n\n| t |\n",
	);
	assert.equal(rendered({ ...outcome, inline: [] }, "| t |"), "s\n\n| t |\n");
});
