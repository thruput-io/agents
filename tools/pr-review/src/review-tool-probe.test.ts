import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as it } from "node:test";
import { fileURLToPath } from "node:url";

const SRC_DIR = fileURLToPath(new URL(".", import.meta.url));
const MAX_CLI_OUTPUT_BYTES = 9000;

it("review-tool-probe define resolves [[term]]s with default depth 1, configurable depth, and unknown-term errors", () => {
	const cliPath = join(SRC_DIR, "review-tool-probe.ts");
	const defaultRun = spawnSync(
		process.execPath,
		[cliPath, "define", "Encapsulated type"],
		{ encoding: "utf8" },
	);
	assert.equal(defaultRun.status, 0);
	const defaultPayload = JSON.parse(defaultRun.stdout) as {
		readonly success: boolean;
		readonly term: string;
		readonly depth: number;
		readonly definitions: readonly { readonly id: string }[];
	};
	assert.equal(defaultPayload.success, true);
	assert.equal(defaultPayload.term, "Encapsulated type");
	assert.equal(defaultPayload.depth, 1);
	assert.equal(defaultPayload.definitions[0]?.id, "Encapsulated type");
	assert.equal(defaultPayload.definitions.length > 1, true);
	assert.equal(
		Buffer.byteLength(defaultRun.stdout, "utf8") <= MAX_CLI_OUTPUT_BYTES,
		true,
	);

	const depthZeroRun = spawnSync(
		process.execPath,
		[cliPath, "define", "Encapsulated type", "0"],
		{ encoding: "utf8" },
	);
	assert.equal(depthZeroRun.status, 0);
	const depthZeroPayload = JSON.parse(depthZeroRun.stdout) as {
		readonly definitions: readonly { readonly id: string }[];
	};
	assert.deepEqual(
		depthZeroPayload.definitions.map((d) => d.id),
		["Encapsulated type"],
	);

	const unknownRun = spawnSync(
		process.execPath,
		[cliPath, "define", "Missing glossary term"],
		{ encoding: "utf8" },
	);
	assert.equal(unknownRun.status, 1);
});

it("review-tool-probe executes -h / --help and errors correctly through symlinks", () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "cli-symlink-"));
	try {
		const linkedSubCli = join(tempRoot, "review-tool-probe");
		symlinkSync(join(SRC_DIR, "review-tool-probe.ts"), linkedSubCli);
		const helpRun = spawnSync(process.execPath, [linkedSubCli, "-h"], {
			encoding: "utf8",
		});
		assert.equal(helpRun.status, 0);
		assert.equal(helpRun.stdout.includes("idToReportViolationOn"), true);

		const badRun = spawnSync(process.execPath, [linkedSubCli, "unknown-cmd"], {
			encoding: "utf8",
		});
		assert.notEqual(badRun.status, 0);
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});
