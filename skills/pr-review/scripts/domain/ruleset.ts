import { z } from 'zod';
import { RulesetSchema, type Ruleset } from './contracts.g.ts';

const GITHUB_FILE = 'https://github.com/';
const GITHUB_BLOB = /^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/.+$/;

export const IndexSchema = z.array(z.object({
  canonical_url: z.url().regex(GITHUB_BLOB, 'is not a file on github.com'),
  title: z.string(),
  focus: z.string(),
  when_to_use: z.string(),
}).transform((entry) => ({
  url: entry.canonical_url,
  rawUrl: entry.canonical_url.replace(GITHUB_FILE, 'https://raw.githubusercontent.com/').replace('/blob/', '/'),
  title: entry.title,
  focus: entry.focus,
  whenToUse: entry.when_to_use,
})));

export type IndexEntry = z.infer<typeof IndexSchema>[number];

export const withText = (entry: IndexEntry, text: string | undefined): Ruleset => RulesetSchema.parse({ ...entry, text });
