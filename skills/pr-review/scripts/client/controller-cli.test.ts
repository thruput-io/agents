import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as it } from "node:test";
import { fileURLToPath } from "node:url";
import { HostAdapterFactory } from "../adapters/adapter-factory.ts";
import { MainAgentController } from "../controller/controller.ts";
import { SubAgentController } from "../controller/sub-agent-controller.ts";
import { runMainAgentCli } from "./controller-cli.ts";
import { runSubAgentCli } from "./sub-agent-cli.ts";

const CLIENT_DIR = fileURLToPath(new URL(".", import.meta.url));
const MAX_CLI_OUTPUT_BYTES = 9000;

it("sub-agent-controller define resolves [[term]]s with default depth 1, configurable depth, and unknown-term errors", () => {
	const cliPath = join(CLIENT_DIR, "sub-agent-cli.ts");
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

it("controller CLIs support -h / --help with row schemas and execute correctly through symlinks", async () => {
	const freshMain = MainAgentController.create(HostAdapterFactory);
	assert.equal(await runMainAgentCli(freshMain, ["-h"]), 0);
	assert.equal(await runMainAgentCli(freshMain, ["--help"]), 0);
	const openProbe = (session: string, name: string) =>
		SubAgentController.forSession(session, name, HostAdapterFactory);
	assert.equal(runSubAgentCli(openProbe, ["-h"]), 0);
	assert.equal(runSubAgentCli(openProbe, ["--help"]), 0);

	const tempRoot = mkdtempSync(join(tmpdir(), "cli-symlink-"));
	const linkedSubCli = join(tempRoot, "review-tool-probe");
	symlinkSync(join(CLIENT_DIR, "sub-agent-cli.ts"), linkedSubCli);
	const helpRun = spawnSync(process.execPath, [linkedSubCli, "-h"], {
		encoding: "utf8",
	});
	assert.equal(helpRun.status, 0);
	assert.equal(helpRun.stdout.includes("idToReportViolationOn"), true);

	const badRun = spawnSync(process.execPath, [linkedSubCli, "unknown-cmd"], {
		encoding: "utf8",
	});
	assert.notEqual(badRun.status, 0);

	rmSync(tempRoot, { recursive: true, force: true });
});
