import { z } from 'zod';
import { parseHunks } from './diff.ts';

const PASSED = new Set(['success', 'skipped', 'neutral']);

export const PullRequestResponse = z.object({
  head: z.object({ sha: z.string() }),
  user: z.object({ login: z.string() }),
  body: z.string().nullish(),
  mergeable_state: z.string(),
}).transform((pr) => ({
  headCommit: pr.head.sha,
  author: pr.user.login,
  description: pr.body ?? '',
  mergeable: pr.mergeable_state,
}));

export const CheckRunsResponse = z.object({
  check_runs: z.array(z.object({ name: z.string(), conclusion: z.string().nullable() })),
}).transform(({ check_runs }) => check_runs
  .filter((check) => check.conclusion === null || !PASSED.has(check.conclusion))
  .map((check) => `check ${check.name} did not succeed`));

export const ReviewRecord = z.object({
  state: z.string(),
  body: z.string().nullish().transform((body) => body ?? ''),
  html_url: z.string(),
  commit_id: z.string(),
});

export const PostedReview = z.object({ html_url: z.string() });

export const ThreadNode = z.object({
  id: z.string(),
  path: z.string(),
  line: z.number().int().nullable(),
  startLine: z.number().int().nullable(),
  diffSide: z.enum(['RIGHT', 'LEFT']),
  isResolved: z.boolean(),
  resolvedBy: z.object({ login: z.string() }).nullable(),
  comments: z.object({ nodes: z.array(z.object({ body: z.string() })) }),
});

export const ThreadsPage = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        reviewThreads: z.object({
          pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
          nodes: z.array(ThreadNode),
        }),
      }),
    }),
  }),
}).transform((page) => page.data.repository.pullRequest.reviewThreads);

export const CompareResponse = z.object({
  files: z.array(z.object({ filename: z.string(), patch: z.string().optional() })),
}).transform((compare) => new Map(
  compare.files.flatMap((file) => file.patch === undefined ? [] : [[file.filename, parseHunks(file.patch.split('\n')).added] as const]),
));

