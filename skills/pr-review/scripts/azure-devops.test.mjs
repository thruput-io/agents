import test from 'node:test';
import assert from 'node:assert/strict';
import { locate, thread, priorOf, refusedOf, staleRefusals, threadPayload, text, KIND } from './azure-devops.mjs';
import { SITE } from './lib.mjs';

test('locate reads an Azure DevOps pull request URL, with or without a query, and nothing else', () => {
  const host = { kind: KIND, organization: 'NavistarCollection', project: 'NavistarProduction', repository: 'DS-DD-DataIntegration-Platform', id: 57121 };
  assert.deepEqual(locate('https://dev.azure.com/NavistarCollection/NavistarProduction/_git/DS-DD-DataIntegration-Platform/pullrequest/57121'), host);
  assert.deepEqual(locate('https://dev.azure.com/NavistarCollection/NavistarProduction/_git/DS-DD-DataIntegration-Platform/pullrequest/57121?path=/a.cs'), host);
  assert.equal(locate('https://github.com/thruput-io/agents/pull/14'), undefined);
});

test('thread folds a thread into the one shape: the side from which file context it carries, resolved meaning resolved by the author', () => {
  const right = { id: 7, status: 'active', threadContext: { filePath: '/a.cs', rightFileStart: { line: 8, offset: 1 }, rightFileEnd: { line: 9, offset: 1 } }, comments: [{ content: 'b' }] };
  const left = { id: 8, status: 'fixed', threadContext: { filePath: '/a.cs', leftFileStart: null, leftFileEnd: { line: 2, offset: 1 } }, comments: [{ content: 'b' }] };
  assert.deepEqual(thread(right), { id: '7', path: 'a.cs', side: 'head', lines: { start: 8, end: 9 }, state: 'open', body: 'b' });
  assert.deepEqual(thread(left), { id: '8', path: 'a.cs', side: 'base', lines: { start: 2, end: 2 }, state: 'resolved-by-author', body: 'b' });
});

test('priorOf finds the head commit of the last summary we posted, from our own summary text', () => {
  const summary = (sha) => ({ id: 1, status: 'active', threadContext: null, comments: [{ content: `**Verdict: approve**\n\n3 rules probed by 2 probes at ${sha} against [the rules](${SITE}): 0 violations` }] });
  const noise = { id: 2, status: null, threadContext: null, comments: [{ content: 'Policy status has been updated' }] };
  assert.equal(priorOf([noise, summary('a'.repeat(40)), summary('b'.repeat(40))]), 'b'.repeat(40));
  assert.equal(priorOf([noise]), undefined);
  assert.equal(priorOf([{ id: 3, status: 'active', threadContext: null, comments: [{ content: `77 rules probed by 22 probes at ${'c'.repeat(40)}: 51 violations ... breaks [P](${SITE}#p)` }] }]), 'c'.repeat(40));
});

test('threadPayload maps an inline finding onto a thread on the right or the left file', () => {
  assert.deepEqual(threadPayload({ path: 'p', side: 'head', lines: { start: 3, end: 3 }, body: 'r' }), { ...text('r'), threadContext: { filePath: '/p', rightFileStart: { line: 3, offset: 1 }, rightFileEnd: { line: 3, offset: 1 } } });
  assert.deepEqual(threadPayload({ path: 'p', side: 'base', lines: { start: 1, end: 4 }, body: 'r' }).threadContext, { filePath: '/p', leftFileStart: { line: 1, offset: 1 }, leftFileEnd: { line: 4, offset: 1 } });
  assert.deepEqual(text('c'), { comments: [{ parentCommentId: 0, commentType: 'text', content: 'c' }], status: 'active' });
});

test('refusedOf finds the refusal we already posted for this head commit, so a second attempt posts none', () => {
  const refusal = { id: 9, status: 'active', threadContext: null, comments: [{ content: `**Verdict: request-changes**\n\nNot reviewed at ${'a'.repeat(40)} against [the rules](${SITE}): the blocking Build policy is running.` }] };
  assert.equal(refusedOf([refusal], 'a'.repeat(40)), '9');
  assert.equal(refusedOf([refusal], 'b'.repeat(40)), undefined);
});

test('staleRefusals lists the refusals of ours that are still active, whatever head they named, so a posted review closes them', () => {
  const refusal = (id, status) => ({ id, status, threadContext: null, comments: [{ content: `**Verdict: request-changes**\n\nNot reviewed at ${'a'.repeat(40)} against [the rules](${SITE}): the blocking Build policy is running.` }] });
  const summary = { id: 3, status: 'active', threadContext: null, comments: [{ content: `3 rules probed by 2 probes at ${'b'.repeat(40)} against [the rules](${SITE}): 0 violations` }] };
  assert.deepEqual(staleRefusals([refusal(1, 'active'), refusal(2, 'fixed'), summary]), ['1']);
});
