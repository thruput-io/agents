import { existsSync, readFileSync, realpathSync } from "node:fs";
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
export const PROBE_BIN_PATH = join(
	SKILL_DIR,
	"dist",
	"bin",
	"review-tool-probe.mjs",
);

export const readReviewSchemaDefs = (
	fileName: string,
): ReadonlyMap<string, unknown> => {
	const schemaPath = join(SKILL_DIR, "schemas", "review", fileName);
	const parsed = JSON.parse(readFileSync(schemaPath, "utf8")) as {
		readonly $defs: Readonly<Record<string, unknown>>;
	};
	return new Map(Object.entries(parsed.$defs));
};

export const isCliEntrypoint = (metaUrl: string): boolean => {
	const [, entryArg] = process.argv;
	if (isNullOrEmpty(entryArg) || !existsSync(entryArg)) {
		return false;
	}
	return realpathSync(fileURLToPath(metaUrl)) === realpathSync(entryArg);
};
