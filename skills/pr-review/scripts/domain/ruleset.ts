import { z } from "zod";
import {
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
	RulebookSchema.decode({
		url: entry.url,
		title: entry.title,
		focus: entry.focus,
		whenToUse: entry.whenToUse,
		text: RulesetTextSchema.decode(text),
	});
