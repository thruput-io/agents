import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isNullOrEmpty } from "../../domain/nullish.ts";

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

export const isCliEntrypoint = (metaUrl: string): boolean => {
	const [, entryArg] = process.argv;
	if (isNullOrEmpty(entryArg) || !existsSync(entryArg)) {
		return false;
	}
	return realpathSync(fileURLToPath(metaUrl)) === realpathSync(entryArg);
};
