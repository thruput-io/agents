import { z } from "zod";
import {
	type LineNumber,
	type Path,
	type Rulebook,
	RulebookSchema,
	type RulesetFocus,
	RulesetFocusSchema,
	type RulesetText,
	RulesetTextSchema,
	type RulesetTitle,
	RulesetTitleSchema,
	type RulesetUrl,
	RulesetUrlSchema,
	type RulesetUse,
	RulesetUseSchema,
} from "./contracts.g.ts";

const GITHUB_FILE = "https://github.com/";
const GITHUB_BLOB = /^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/.+$/u;

export const IndexSchema = z.array(
	z
		.object({
			canonical_url: RulesetUrlSchema.refine(
				(url) => GITHUB_BLOB.test(url),
				"is not a file on github.com",
			),
			title: RulesetTitleSchema,
			focus: RulesetFocusSchema,
			when_to_use: RulesetUseSchema,
		})
		.transform(
			(
				entry,
			): {
				url: RulesetUrl;
				rawUrl: string;
				title: RulesetTitle;
				focus: RulesetFocus;
				whenToUse: RulesetUse;
			} => ({
				url: entry.canonical_url,
				rawUrl: entry.canonical_url
					.replace(GITHUB_FILE, "https://raw.githubusercontent.com/")
					.replace("/blob/", "/"),
				title: entry.title,
				focus: entry.focus,
				whenToUse: entry.when_to_use,
			}),
		),
);

export type IndexEntry = z.infer<typeof IndexSchema>[number];

export const withText = (entry: IndexEntry, text: RulesetText): Rulebook =>
	RulebookSchema.parse({ ...entry, text: RulesetTextSchema.parse(text) });

export const FILE_LINES: LineNumber = 1000;
export const DIFF_LINES: LineNumber = 1600;
export const FILE_TOO_LARGE = "File too large";
export const DIFF_TOO_LARGE =
	"pull request is too large. It cannot be kept focused and reviewable as required, and commenting on it would start an endless loop";
const TEST_DIR = /(?:^|\/)(?:tests?|specs?|__tests__|[^/]*\.tests?)\//iu;
const TEST_FILE =
	/(?:^|\/)(?:(?:test|spec)s?[._-].+|.+[._-](?:test|spec)s?|(?:test|spec)s?|[A-Za-z0-9]+Tests?)\.[^/]+$/u;
export const isTest = (path: Path): boolean =>
	TEST_DIR.test(path) || TEST_FILE.test(path);
const LOCK_FILE =
	/(?:^|\/)(?:[^/]+\.lock|[^/]+\.lockb|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|go\.sum|packages\.lock\.json|Pipfile\.lock)$/iu;
export const isLock = (path: Path): boolean => LOCK_FILE.test(path);
const DOC_DIR = /(?:^|\/)docs\//iu;
const DOC_FILE =
	/(?:^|\/)(?:.*\.(?:md|markdown|rst|txt|adoc)|LICENSE|NOTICE|CHANGELOG(?:\.[^/]+)?)$/iu;
export const isDoc = (path: Path): boolean =>
	DOC_DIR.test(path) || DOC_FILE.test(path);

export interface FileLineCount {
	readonly path: Path;
	readonly lines: number;
	readonly added: number;
}

const isChecked = (file: FileLineCount): boolean =>
	!(isTest(file.path) || isLock(file.path) || isDoc(file.path));

export function oversizedFiles(counts: readonly FileLineCount[]): Path[] {
	const checked = counts.filter(isChecked);
	const totalAdded = checked.reduce((sum, file) => sum + file.added, 0);
	if (totalAdded > DIFF_LINES) {
		return checked.map((file) => file.path);
	}
	return checked
		.filter((file) => file.lines > FILE_LINES)
		.map((file) => file.path);
}

export function tooLarge(counts: readonly FileLineCount[]): string[] {
	const checked = counts.filter(isChecked);
	const fileReasons = checked
		.filter((file) => file.lines > FILE_LINES)
		.map(
			(file) =>
				`${file.path} is ${file.lines} lines long, which breaks ${FILE_TOO_LARGE}`,
		);
	const totalAdded = checked.reduce((sum, file) => sum + file.added, 0);
	if (totalAdded > DIFF_LINES) {
		return [...fileReasons, DIFF_TOO_LARGE];
	}
	return fileReasons;
}
