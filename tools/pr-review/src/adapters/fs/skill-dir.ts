import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const findSkillDir = (dir: string): string => {
	if (existsSync(join(dir, "SKILL.md")) && existsSync(join(dir, "rules"))) {
		return dir;
	}
	const siblingSkill = join(dir, "skills", "pr-review");
	if (
		existsSync(join(siblingSkill, "SKILL.md")) &&
		existsSync(join(siblingSkill, "rules"))
	) {
		return siblingSkill;
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
