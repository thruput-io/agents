import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Outcome } from '../domain/outcome.mjs';
import { RULES_SITE_URL } from '../domain/rulebook.mjs';
import {
  buildAdoRouteParams,
  buildAdoTextThread,
  buildAdoThreadPayload,
  buildAdoThreadRouteParams,
  createAzureDevOpsAdapter,
  filterAdoUnposted,
  findAdoPriorCommit,
  findAdoRefusedThreadId,
  findAdoStaleRefusalIds,
  foldAdoThread,
} from './azure-devops.mjs';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

describe('azure-devops adapter', () => {
  it('folds Azure DevOps threads and locates prior commits and refusals', () => {
    const right = {
      id: 7,
      status: 'active',
      threadContext: {
        filePath: '/a.cs',
        rightFileStart: { line: 8, offset: 1 },
        rightFileEnd: { line: 9, offset: 1 },
      },
      comments: [{ content: 'b' }],
    };
    const left = {
      id: 8,
      status: 'fixed',
      threadContext: {
        filePath: '/a.cs',
        leftFileStart: null,
        leftFileEnd: { line: 2, offset: 1 },
      },
      comments: [{ content: 'b' }],
    };
    assert.deepEqual(foldAdoThread(right).unwrap().toContract(), {
      id: '7',
      path: 'a.cs',
      side: 'head',
      lines: { start: 8, end: 9 },
      state: 'open',
      body: 'b',
    });
    assert.deepEqual(foldAdoThread(left).unwrap().toContract(), {
      id: '8',
      path: 'a.cs',
      side: 'base',
      lines: { start: 2, end: 2 },
      state: 'resolved-by-author',
      body: 'b',
    });

    const summary = (sha) => ({
      id: 1,
      status: 'active',
      threadContext: null,
      comments: [
        {
          content: `**Verdict: approve**\n\n3 rules probed by 2 probes at ${sha} against [the rules](${RULES_SITE_URL}): 0 violations`,
        },
      ],
    });
    assert.equal(findAdoPriorCommit([summary(SHA_A), summary(SHA_B)]), SHA_B);

    const refusal = (id, status) => ({
      id,
      status,
      threadContext: null,
      comments: [
        {
          content: `**Verdict: request-changes**\n\nNot reviewed at ${SHA_A} against [the rules](${RULES_SITE_URL}): Build failed.`,
        },
      ],
    });
    assert.equal(findAdoRefusedThreadId([refusal(9, 'active')], SHA_A), '9');
    assert.equal(findAdoRefusedThreadId([refusal(9, 'active')], SHA_B), null);
    assert.deepEqual(findAdoStaleRefusalIds([refusal(1, 'active'), refusal(2, 'fixed')]), ['1']);
  });

  it('builds Azure DevOps thread payloads, route parameters, and filters unposted items', () => {
    const cited = `r breaks [P](${RULES_SITE_URL}#p)`;
    const outcome = Outcome.fromRaw({
      headCommit: SHA_A,
      verdict: 'request-changes',
      summary: `**Verdict: request-changes**\n\n3 rules probed by 2 probes at ${SHA_A} against [the rules](${RULES_SITE_URL}): 1 violations`,
      inline: [
        { path: 'p', side: 'head', lines: { start: 3, end: 3 }, body: cited },
        { path: 'q', side: 'base', lines: { start: 1, end: 4 }, body: 's' },
      ],
      settle: ['11', '99'],
      reopen: [],
    }).unwrap();

    const [firstFinding, secondFinding] = outcome.inline();
    assert.deepEqual(buildAdoThreadPayload(firstFinding), {
      ...buildAdoTextThread(cited),
      threadContext: {
        filePath: '/p',
        rightFileStart: { line: 3, offset: 1 },
        rightFileEnd: { line: 3, offset: 1 },
      },
    });
    assert.deepEqual(buildAdoThreadPayload(secondFinding).threadContext, {
      filePath: '/q',
      leftFileStart: { line: 1, offset: 1 },
      leftFileEnd: { line: 4, offset: 1 },
    });

    const carried = {
      id: 11,
      status: 'active',
      threadContext: {
        filePath: '/p',
        rightFileStart: { line: 3, offset: 1 },
        rightFileEnd: { line: 3, offset: 1 },
      },
      comments: [{ content: cited }],
    };
    const postedSummary = {
      id: 12,
      status: 'active',
      threadContext: null,
      comments: [{ content: `${outcome.summary().toContract()}\n\n| t |` }],
    };
    const left = filterAdoUnposted(outcome, [carried, postedSummary]);
    assert.deepEqual(
      left.inline.map((f) => f.path().toContract()),
      ['q'],
    );
    assert.equal(left.summary, false);
    assert.deepEqual(left.settle, ['11']);

    const host = { kind: 'azure-devops', organization: 'o', project: 'p', repository: 'r', id: 1 };
    assert.deepEqual(buildAdoRouteParams(host), [
      '--route-parameters',
      'project=p',
      'repositoryId=r',
      'pullRequestId=1',
    ]);
    assert.deepEqual(buildAdoThreadRouteParams(host, '42'), [
      '--route-parameters',
      'project=p',
      'repositoryId=r',
      'pullRequestId=1',
      'threadId=42',
    ]);
    assert.equal(typeof createAzureDevOpsAdapter, 'function');
  });
});
