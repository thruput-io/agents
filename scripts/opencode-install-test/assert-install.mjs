import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const opencodeConfigDir = join(homedir(), ".config", "opencode");
const expectedFiles = [
	join(opencodeConfigDir, "plugins", "thruput.ts"),
	join(opencodeConfigDir, "skills", "dad-joke", "SKILL.md"),
	join(opencodeConfigDir, "skills", "pr-review", "SKILL.md"),
];

const installedFiles = expectedFiles.filter((filePath) => existsSync(filePath));
const reviewTool = spawnSync("review-tool", ["--help"], { encoding: "utf8" });
const reviewToolProbe = spawnSync("review-tool-probe", ["--help"], {
	encoding: "utf8",
});

assert.deepEqual(
	{
		installedFiles,
		reviewToolExitStatus: reviewTool.status,
		reviewToolProbeExitStatus: reviewToolProbe.status,
	},
	{
		installedFiles: expectedFiles,
		reviewToolExitStatus: 0,
		reviewToolProbeExitStatus: 0,
	},
);
