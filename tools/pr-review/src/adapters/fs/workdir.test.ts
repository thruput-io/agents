import assert from "node:assert/strict";
import {
	existsSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as it } from "node:test";
import { LedgerDirectory } from "./ledger-directory.ts";
import { Workdir } from "./workdir.ts";

it("Workdir parses an absolute path and derives its sibling LedgerDirectory and snapshot subdirectory", () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "workdir-derive-"));
	try {
		const workspacePath = join(tempRoot, "review", "workspace");
		const expectedSiblingPath = join(tempRoot, "review", "ledger");
		const workdir = Workdir.from(workspacePath);
		const same = Workdir.from(workspacePath);
		const expectedSibling = LedgerDirectory.from(expectedSiblingPath);
		assert.equal(workdir.success, true);
		assert.equal(same.success, true);
		assert.equal(expectedSibling.success, true);
		assert.equal(workdir.data.equals(same.data), true);
		assert.equal(workdir.data.toString(), workspacePath);
		assert.equal(
			workdir.data.ledgerDirectory().equals(expectedSibling.data),
			true,
		);
		assert.equal(
			workdir.data.snapshotDirectory().toString(),
			join(workspacePath, "snapshot"),
		);
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

it("Workdir immediately writes to establish it is operational, fails on unwriteable path, and warns when traversing a symlink", () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "workdir-operational-"));
	try {
		const realDir = join(tempRoot, "real-workspace");
		const symlinkDir = join(tempRoot, "symlink-workspace");
		const blockerFile = join(tempRoot, "not-a-dir");
		writeFileSync(blockerFile, "file", "utf8");

		const realWorkdir = Workdir.from(realDir);
		assert.equal(realWorkdir.success, true);
		assert.equal(existsSync(join(realDir, ".operational")), true);
		assert.equal(existsSync(join(tempRoot, "ledger", ".operational")), true);
		assert.equal(realWorkdir.data.isSymlinked(), false);
		assert.equal(realWorkdir.data.warning(), null);

		symlinkSync(realDir, symlinkDir);
		const linkedWorkdir = Workdir.open(symlinkDir);
		assert.equal(linkedWorkdir.success, true);
		assert.equal(linkedWorkdir.data.isSymlinked(), true);
		assert.equal(linkedWorkdir.data.warning()?.includes("symlink"), true);

		const staleLedgerFile = join(tempRoot, "ledger", "stale-slice.json");
		writeFileSync(staleLedgerFile, '{"stale":true}', "utf8");
		const refreshedWorkdir = Workdir.from(
			join(symlinkDir, "nested", "workspace"),
		);
		assert.equal(refreshedWorkdir.success, true);
		assert.equal(refreshedWorkdir.data.isSymlinked(), true);
		assert.equal(
			existsSync(join(symlinkDir, "nested", "ledger", "stale-slice.json")),
			false,
		);
		const parentWorkdir = Workdir.from(realDir);
		assert.equal(parentWorkdir.success, true);
		assert.equal(existsSync(staleLedgerFile), false);

		const unwriteableWorkdir = Workdir.from(join(blockerFile, "child"));
		assert.equal(unwriteableWorkdir.success, false);
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});
