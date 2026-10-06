import test from 'node:test';
import assert from 'node:assert/strict';
import { locate, thread, comment, payload, refusedIn, KIND } from './github.mjs';
import { SITE } from './lib.mjs';

test('locate reads a GitHub pull request URL and nothing else', () => {
  assert.deepEqual(locate('https://github.com/thruput-io/agents/pull/14'), { kind: KIND, owner: 'thruput-io', repository: 'agents', number: 14 });
  assert.equal(locate('https://dev.azure.com/o/p/_git/r/pullrequest/1'), undefined);
  assert.equal(locate('.@main..HEAD'), undefined);
});

test('thread folds a review thread into the one shape: side, lines, and whether the author resolved it', () => {
  const node = (fields) => ({ id: 'T', path: 'a.sh', line: 9, startLine: 8, diffSide: 'RIGHT', isResolved: false, resolvedBy: null, comments: { nodes: [{ body: 'b' }] }, ...fields });
  assert.deepEqual(thread(node({}), 'author'), { id: 'T', path: 'a.sh', side: 'head', lines: { start: 8, end: 9 }, state: 'open', body: 'b' });
  assert.equal(thread(node({ isResolved: true, resolvedBy: { login: 'author' } }), 'author').state, 'resolved-by-author');
  assert.equal(thread(node({ isResolved: true, resolvedBy: { login: 'someone' } }), 'author').state, 'resolved');
  assert.deepEqual(thread(node({ startLine: null, diffSide: 'LEFT' }), 'author').lines, { start: 9, end: 9 });
  assert.equal(thread(node({ diffSide: 'LEFT' }), 'author').side, 'base');
});

test('comment and payload map the outcome onto what the host accepts', () => {
  const one = { path: 'p', side: 'head', lines: { start: 3, end: 3 }, body: 'r' };
  const range = { path: 'q', side: 'base', lines: { start: 1, end: 4 }, body: 'r' };
  assert.deepEqual(comment(one), { path: 'p', line: 3, side: 'RIGHT', body: 'r' });
  assert.deepEqual(comment(range), { path: 'q', start_line: 1, start_side: 'LEFT', line: 4, side: 'LEFT', body: 'r' });
  const review = payload({ headCommit: 'h', verdict: 'request-changes', summary: 's', inline: [one], settle: [], reopen: [] }, '| t |');
  assert.equal(review.commit_id, 'h');
  assert.equal(review.event, 'REQUEST_CHANGES');
  assert.equal(review.body, 's\n\n<details>\n<summary>Review ledger</summary>\n\n| t |\n\n</details>');
  assert.deepEqual(review.comments, [comment(one)]);
  assert.equal(payload({ headCommit: 'h', verdict: 'approve', summary: 's', inline: [], settle: [], reopen: [] }, '').event, 'APPROVE');
});

test('refusedIn finds the refusal we already posted for this head commit, so a second attempt posts none', () => {
  const refusal = { id: 5, state: 'CHANGES_REQUESTED', html_url: 'https://github.com/o/r/pull/1#pullrequestreview-5', body: `**Verdict: request-changes**\n\nNot reviewed at ${'a'.repeat(40)} against [the rules](${SITE}): check build did not succeed.` };
  assert.equal(refusedIn([refusal], 'a'.repeat(40)), refusal.html_url);
  assert.equal(refusedIn([refusal], 'b'.repeat(40)), undefined);
});
