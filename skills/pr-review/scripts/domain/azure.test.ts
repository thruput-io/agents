import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BuildPolicies, PullRequestResponse, ThreadsResponse } from './azure.ts';

test('a pull request is its head commit, merge status, refs, author and description; no description is empty', () => {
  const pr = {
    lastMergeSourceCommit: { commitId: 'a'.repeat(40) }, mergeStatus: 'succeeded', sourceRefName: 'refs/heads/f', targetRefName: 'refs/heads/main',
    createdBy: { uniqueName: 'me@example.com' }, description: null, pullRequestId: 1,
  };
  assert.deepEqual(PullRequestResponse.parse(pr), {
    headCommit: 'a'.repeat(40), mergeStatus: 'succeeded', sourceRefName: 'refs/heads/f', targetRefName: 'refs/heads/main', author: 'me@example.com', description: '',
  });
});

test('only blocking Build policies are kept', () => {
  const policy = (status: string, isBlocking: boolean, displayName: string) => ({ status, configuration: { isBlocking, type: { displayName } } });
  const kept = BuildPolicies.parse([policy('rejected', true, 'Build'), policy('approved', true, 'Build'), policy('rejected', false, 'Build'), policy('rejected', true, 'Reviewers')]);
  assert.deepEqual(kept.map((item) => item.status), ['rejected', 'approved']);
});

test('threads are the envelope value; a system thread has no status and no comment content is empty', () => {
  const envelope = { count: 2, value: [
    { id: 1, status: 'active', threadContext: { filePath: '/a.sh', rightFileStart: null, rightFileEnd: { line: 4, offset: 1 }, leftFileStart: null, leftFileEnd: null }, comments: [{ content: 'x' }] },
    { id: 2, comments: [{ content: null }] },
  ] };
  const [first, second] = ThreadsResponse.parse(envelope);
  assert.equal(first?.status, 'active');
  assert.equal(first?.threadContext?.rightFileEnd?.line, 4);
  assert.equal(second?.status, undefined);
  assert.equal(second?.comments[0]?.content, '');
});
