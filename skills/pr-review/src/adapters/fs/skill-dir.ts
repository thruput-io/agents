import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const findSkillDir = (dir: string): string => {
	if (existsSync(join(dir, "rules")) && existsSync(join(dir, "package.json"))) {
		return dir;
	}
	const parent = dirname(dir);
	if (parent === dir) {
		throw new Error("Could not locate skill root containing rules/");
	}
	return findSkillDir(parent);
};

export const SKILL_DIR = findSkillDir(dirname(fileURLToPath(import.meta.url)));
export const PROBE_BIN_PATH = join(
	SKILL_DIR,
	"dist",
	"bin",
	"review-tool-probe.mjs",
);
