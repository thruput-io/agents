import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { Outcome } from '../domain/outcome.mjs';
import { Host } from '../domain/pull-request.mjs';
import { createGitAdapter, renderGitReview } from './git.mjs';

const SHA = 'e2bde7afe2f2b1ffc23cdb6f0dc00601b4868eb7';
const BASE_SHA = '1111111111111111111111111111111111111111';

describe('git adapter', () => {
  it('resolves git range into PullRequest and ChangeSet and renders markdown review', () => {
    const outputs = {
      'rev-parse --verify HEAD^{commit}': `${SHA}\n`,
      [`merge-base main ${SHA}`]: `${BASE_SHA}\n`,
      [`log -1 --format=%ae ${SHA}`]: 'dev@thruput.se\n',
      [`log --format=%B ${BASE_SHA}..${SHA}`]: 'Commit description\n',
      [`diff --no-color ${BASE_SHA} ${SHA}`]: [
        'diff --git a/src/a.mjs b/src/a.mjs',
        '--- a/src/a.mjs',
        '+++ b/src/a.mjs',
        '@@ -1,1 +1,2 @@',
        ' const x = 1;',
        '+const y = 2;',
      ].join('\n'),
    };
    const fakeRun = (_cmd, args) => outputs[args.slice(2).join(' ')];

    const adapter = createGitAdapter(fakeRun);
    const host = Host.fromSpec('/w/repo@main..HEAD').unwrap().toContract();
    const resolved = adapter.resolve(host, '/tmp/unused');
    assert.equal(resolved.headCommit.toContract(), SHA);
    assert.equal(resolved.pullRequest.toContract().author, 'dev@thruput.se');
    const changeSet = resolved.diff();
    assert.equal(changeSet.files().length, 1);

    const outcome = Outcome.fromRaw({
      headCommit: SHA,
      verdict: 'request-changes',
      summary: '**Verdict: request-changes**',
      inline: [{ path: 'src/a.mjs', side: 'head', lines: { start: 2, end: 2 }, body: 'Bad line' }],
      settle: [],
      reopen: [],
    }).unwrap();

    assert.equal(
      renderGitReview(outcome, '| rule |'),
      '**Verdict: request-changes**\n\n- `src/a.mjs:2-2` (head): Bad line\n\n| rule |\n',
    );

    const dir = mkdtempSync(join(tmpdir(), 'git-adapter-test-'));
    try {
      const posted = adapter.post(host, outcome, '| rule |', dir);
      assert.equal(posted.inline, 1);
      assert.equal(readFileSync(posted.review, 'utf8').includes('Bad line'), true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
