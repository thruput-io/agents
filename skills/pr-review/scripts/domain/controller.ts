import { z } from 'zod';
import { CommitSchema, OutcomeSchema, PullRequestSchema, ThreadSchema } from './contracts.g.ts';

export const PrepareSchema = z.object({
  pullRequest: PullRequestSchema,
  headCommit: CommitSchema,
  threads: z.array(ThreadSchema),
});

export const PreconditionsSchema = z.object({
  blocked: z.array(z.string()),
  prior: CommitSchema.optional(),
  refused: z.string().optional(),
});

export const ReportSchema = z.object({
  review: z.string(),
  posted: z.boolean(),
  inline: z.number().int().nonnegative(),
  settled: z.number().int().nonnegative(),
  reopened: z.number().int().nonnegative(),
});

export const ControllerSchema = z.object({
  prepare: PrepareSchema,
  preconditions: PreconditionsSchema,
  review: OutcomeSchema,
  report: ReportSchema,
});
