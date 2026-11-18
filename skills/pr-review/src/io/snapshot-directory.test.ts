import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as it } from "node:test";
import { GithubPullRequest } from "../domain/code-under-review.ts";
import { parseNumstat } from "../domain/diff.ts";
import { nonnull } from "../domain/nullish.ts";
import { CodeUnderReviewSnapshot } from "./review-snapshot.ts";
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
