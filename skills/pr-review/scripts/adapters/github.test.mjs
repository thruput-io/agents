import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Outcome } from '../domain/outcome.mjs';
import { RULES_SITE_URL } from '../domain/rulebook.mjs';
import {
  buildGitHubComment,
  buildGitHubPayload,
  createGitHubAdapter,
  findPostedReviewUrl,
  findRefusedReviewUrl,
  foldGitHubThread,
} from './github.mjs';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

describe('github adapter', () => {
  it('folds GitHub review threads into validated Thread domain objects', () => {
    const makeNode = (overrides) => ({
      id: 'PRRT_1',
      path: 'a.sh',
      line: 9,
      startLine: 8,
      diffSide: 'RIGHT',
      isResolved: false,
      resolvedBy: null,
      comments: { nodes: [{ body: 'Finding breaks [P](https://thruput.se/agents/#p)' }] },
      ...overrides,
    });

    assert.deepEqual(foldGitHubThread(makeNode({}), 'author').unwrap().toContract(), {
      id: 'PRRT_1',
      path: 'a.sh',
      side: 'head',
      lines: { start: 8, end: 9 },
      state: 'open',
      body: 'Finding breaks [P](https://thruput.se/agents/#p)',
    });
    assert.equal(
      foldGitHubThread(makeNode({ isResolved: true, resolvedBy: { login: 'author' } }), 'author')
        .unwrap()
        .state(),
      'resolved-by-author',
    );
    assert.equal(
      foldGitHubThread(makeNode({ isResolved: true, resolvedBy: { login: 'other' } }), 'author')
        .unwrap()
        .state(),
      'resolved',
    );
    assert.deepEqual(
      foldGitHubThread(makeNode({ startLine: null, diffSide: 'LEFT' }), 'author')
        .unwrap()
        .lines()
        .toContract(),
      { start: 9, end: 9 },
    );
  });

  it('builds GitHub review payload and detects already-posted or refused reviews', () => {
    const outcome = Outcome.fromRaw({
      headCommit: SHA_A,
      verdict: 'request-changes',
      summary: 'Summary text',
      inline: [
        { path: 'p.mjs', side: 'head', lines: { start: 3, end: 3 }, body: 'single' },
        { path: 'q.mjs', side: 'base', lines: { start: 1, end: 4 }, body: 'multi' },
      ],
      settle: [],
      reopen: [],
    }).unwrap();

    const [firstInline, secondInline] = outcome.inline();
    assert.deepEqual(buildGitHubComment(firstInline), {
      path: 'p.mjs',
      line: 3,
      side: 'RIGHT',
      body: 'single',
    });
    assert.deepEqual(buildGitHubComment(secondInline), {
      path: 'q.mjs',
      start_line: 1,
      start_side: 'LEFT',
      line: 4,
      side: 'LEFT',
      body: 'multi',
    });

    const built = buildGitHubPayload(outcome, '| rule |');
    assert.equal(built.commit_id, SHA_A);
    assert.equal(built.event, 'REQUEST_CHANGES');
    assert.equal(
      built.body,
      'Summary text\n\n<details>\n<summary>Review ledger</summary>\n\n| rule |\n\n</details>',
    );

    const refusal = {
      id: 5,
      state: 'CHANGES_REQUESTED',
      html_url: 'https://github.com/o/r/pull/1#pullrequestreview-5',
      body: `**Verdict: request-changes**\n\nNot reviewed at ${SHA_A} against [the rules](${RULES_SITE_URL}): check build did not succeed.`,
    };
    assert.equal(findRefusedReviewUrl([refusal], SHA_A), refusal.html_url);
    assert.equal(findRefusedReviewUrl([refusal], SHA_B), null);

    const review = {
      id: 7,
      state: 'CHANGES_REQUESTED',
      html_url: 'https://github.com/o/r/pull/1#pullrequestreview-7',
      body: `**Verdict: request-changes**\n\n3 rules probed by 2 probes at ${SHA_A} against [the rules](${RULES_SITE_URL}): 1 violations`,
    };
    assert.equal(findPostedReviewUrl([review], SHA_A), review.html_url);
    assert.equal(findPostedReviewUrl([review], SHA_B), null);
    assert.equal(typeof createGitHubAdapter, 'function');
  });
});
