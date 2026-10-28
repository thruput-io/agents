import { z } from 'zod';

const Position = z.object({ line: z.number().int() }).nullish();

const ThreadContext = z.object({
  filePath: z.string().nullish(),
  rightFileStart: Position,
  rightFileEnd: Position,
  leftFileStart: Position,
  leftFileEnd: Position,
});

const Comment = z.object({
  content: z.string().nullish().transform((content) => content ?? ''),
});

export const PullRequestResponse = z.object({
  lastMergeSourceCommit: z.object({ commitId: z.string() }),
  mergeStatus: z.string(),
  sourceRefName: z.string(),
  targetRefName: z.string(),
  createdBy: z.object({ uniqueName: z.string() }),
  description: z.string().nullish(),
}).transform((pr) => ({
  headCommit: pr.lastMergeSourceCommit.commitId,
  mergeStatus: pr.mergeStatus,
  sourceRefName: pr.sourceRefName,
  targetRefName: pr.targetRefName,
  author: pr.createdBy.uniqueName,
  description: pr.description ?? '',
}));

export const BuildPolicies = z.array(z.object({
  status: z.string(),
  configuration: z.object({ isBlocking: z.boolean(), type: z.object({ displayName: z.string() }) }),
})).transform((policies) => policies.filter((policy) => policy.configuration.isBlocking && policy.configuration.type.displayName === 'Build'));

export const ThreadResponse = z.object({
  id: z.number().int(),
  status: z.string().nullish(),
  threadContext: ThreadContext.nullish(),
  comments: z.array(Comment),
});

export const ThreadsResponse = z.object({ value: z.array(ThreadResponse) }).transform((envelope) => envelope.value);

export const PostedThread = z.object({ id: z.number().int() });
