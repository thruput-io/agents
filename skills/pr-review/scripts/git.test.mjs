import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { locate, rendered, KIND } from './git.mjs';

test('locate reads a repository path with the two refs that bound the change, and nothing else', () => {
  assert.deepEqual(locate('.@main..HEAD'), { kind: KIND, repository: resolve('.'), base: 'main', head: 'HEAD' });
  assert.deepEqual(locate('/w/repo@origin/main..feature/x'), { kind: KIND, repository: '/w/repo', base: 'origin/main', head: 'feature/x' });
  assert.equal(locate('https://github.com/thruput-io/agents/pull/14'), undefined);
});

test('rendered writes the review as markdown: the summary, each inline finding with its place, and the ledger', () => {
  const outcome = { headCommit: 'h', verdict: 'request-changes', summary: 's', inline: [{ path: 'p', side: 'head', lines: { start: 3, end: 4 }, body: 'r' }], settle: [], reopen: [] };
  assert.equal(rendered(outcome, '| t |'), 's\n\n- `p:3-4` (head): r\n\n| t |\n');
  assert.equal(rendered({ ...outcome, inline: [] }, '| t |'), 's\n\n| t |\n');
});
