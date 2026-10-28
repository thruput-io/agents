import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CheckRunsResponse, CompareResponse, PullRequestResponse, ReviewRecord, ThreadsPage } from './github.ts';

test('a pull request is its head commit, author, description and merge state; no description is an empty one', () => {
  const pr = { head: { sha: 'a'.repeat(40) }, user: { login: 'author' }, body: null, mergeable_state: 'clean', number: 14 };
  assert.deepEqual(PullRequestResponse.parse(pr), { headCommit: 'a'.repeat(40), author: 'author', description: '', mergeable: 'clean' });
});

test('every check that did not succeed is named; skipped and neutral ones pass', () => {
  const runs = { check_runs: [
    { name: 'build', conclusion: 'success' },
    { name: 'lint', conclusion: 'failure' },
    { name: 'docs', conclusion: 'skipped' },
    { name: 'queued', conclusion: null },
  ] };
  assert.deepEqual(CheckRunsResponse.parse(runs), ['check lint did not succeed', 'check queued did not succeed']);
});

test('a review without a body has an empty body', () => {
  const review = { state: 'COMMENTED', body: null, html_url: 'https://github.com/o/r/pull/1#pullrequestreview-1', commit_id: 'a'.repeat(40) };
  assert.equal(ReviewRecord.parse(review).body, '');
});

test('a page of review threads is its nodes and its paging, whatever else GitHub returns', () => {
  const page = { data: { repository: { pullRequest: { reviewThreads: {
    pageInfo: { hasNextPage: false, endCursor: null },
    nodes: [{ id: 'T', path: 'a.sh', line: 9, startLine: null, diffSide: 'RIGHT', isResolved: false, resolvedBy: null, comments: { nodes: [{ body: 'b' }] }, extra: 1 }],
  } } } } };
  assert.deepEqual(ThreadsPage.parse(page), {
    pageInfo: { hasNextPage: false, endCursor: null },
    nodes: [{ id: 'T', path: 'a.sh', line: 9, startLine: null, diffSide: 'RIGHT', isResolved: false, resolvedBy: null, comments: { nodes: [{ body: 'b' }] } }],
  });
});

test('a compare keeps the added lines of each changed file with a patch, by file name', () => {
  const compare = { files: [
    { filename: 'a.sh', patch: '@@ -1,1 +1,2 @@\n keep\n+one\n+two' },
    { filename: 'b.bin' },
  ] };
  assert.deepEqual([...CompareResponse.parse(compare)], [['a.sh', [{ start: 2, end: 3 }]]]);
});
