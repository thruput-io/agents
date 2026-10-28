import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { z } from 'zod';
import { TargetSchema } from './host.ts';

test('a GitHub pull request URL is a GitHub host, and nothing else', () => {
  assert.deepEqual(TargetSchema.parse('https://github.com/thruput-io/agents/pull/14'), { kind: 'github', owner: 'thruput-io', repository: 'agents', number: 14 });
});

test('an Azure DevOps pull request URL is an Azure DevOps host, with or without a query', () => {
  const host = { kind: 'azure-devops', organization: 'NavistarCollection', project: 'NavistarProduction', repository: 'DS-DD-DataIntegration-Platform', id: 57121 };
  assert.deepEqual(TargetSchema.parse('https://dev.azure.com/NavistarCollection/NavistarProduction/_git/DS-DD-DataIntegration-Platform/pullrequest/57121'), host);
  assert.deepEqual(TargetSchema.parse('https://dev.azure.com/NavistarCollection/NavistarProduction/_git/DS-DD-DataIntegration-Platform/pullrequest/57121?path=/a.cs'), host);
});

test('a repository path with two refs is a git host, its path made absolute', () => {
  assert.deepEqual(TargetSchema.parse('.@main..HEAD'), { kind: 'git', repository: resolve('.'), base: 'main', head: 'HEAD' });
  assert.deepEqual(TargetSchema.parse('/w/repo@origin/main..feature/x'), { kind: 'git', repository: '/w/repo', base: 'origin/main', head: 'feature/x' });
});

test('a target that is none of these is refused with the reason', () => {
  assert.throws(() => TargetSchema.parse('https://example.com/x'), (error: unknown) => z.prettifyError(error as z.ZodError).includes('is not a pull request URL this skill knows'));
});
