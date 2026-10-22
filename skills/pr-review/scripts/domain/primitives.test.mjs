import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ChangedPath,
  CommitSha,
  Identifier,
  LineNumber,
  LineText,
  NonEmptyText,
  PositiveInteger,
  Ref,
  RepositoryPath,
  RulesetUrl,
  ThreadId,
} from './primitives.mjs';

function unwrapOk(result) {
  return result.match({
    ok: (value) => value,
    err: (error) => {
      throw new Error(`Expected Ok, got Err: ${error}`);
    },
  });
}

function unwrapErr(result) {
  return result.match({
    ok: () => {
      throw new Error('Expected Err, got Ok');
    },
    err: (error) => error,
  });
}

describe('Domain Primitives', () => {
  test('CommitSha validates 40-char lowercase hex and rejects malformed SHAs', () => {
    const validSha = 'e2bde7afe2f2b1ffc23cdb6f0dc00601b4868eb7';
    const sha = unwrapOk(CommitSha.fromRaw(validSha));
    const sameSha = unwrapOk(CommitSha.fromRaw(validSha));
    const errText = unwrapErr(CommitSha.fromRaw('not-a-sha'));

    assert.equal(Object.isFrozen(sha), true);
    assert.equal(sha.toContract(), validSha);
    assert.equal(sha.equals(sameSha), true);
    assert.equal(errText.includes('CommitSha'), true);
  });

  test('ChangedPath validates repo-relative paths without leading slash', () => {
    const path = unwrapOk(ChangedPath.fromRaw('scripts/verify.sh'));
    const leadingSlashErr = unwrapErr(ChangedPath.fromRaw('/abs/path.sh'));
    const emptyErr = unwrapErr(ChangedPath.fromRaw(''));

    assert.equal(path.toContract(), 'scripts/verify.sh');
    assert.equal(leadingSlashErr.includes('ChangedPath'), true);
    assert.equal(emptyErr.includes('ChangedPath'), true);
  });

  test('LineNumber enforces 1-based integers and supports comparison and arithmetic', () => {
    const line10 = unwrapOk(LineNumber.fromRaw(10));
    const line15 = unwrapOk(LineNumber.fromRaw(15));
    const line11 = unwrapOk(line10.next());
    const zeroErr = unwrapErr(LineNumber.fromRaw(0));

    assert.equal(line10.toContract(), 10);
    assert.equal(line11.toContract(), 11);
    assert.equal(line10.distanceTo(line15), 5);
    assert.equal(line10.isBeforeOrAt(line15), true);
    assert.equal(line15.isAfterOrAt(line10), true);
    assert.equal(zeroErr.includes('LineNumber'), true);
  });

  test('LineText allows empty strings and rejects non-strings or newline characters', () => {
    const emptyLine = unwrapOk(LineText.fromRaw(''));
    const codeLine = unwrapOk(LineText.fromRaw('const x = 1;'));
    const newlineErr = unwrapErr(LineText.fromRaw('line1\nline2'));

    assert.equal(emptyLine.toContract(), '');
    assert.equal(codeLine.toContract(), 'const x = 1;');
    assert.equal(newlineErr.includes('LineText'), true);
  });

  test('RulesetUrl validates canonical HTTP/HTTPS URLs and rejects invalid URIs', () => {
    const url = unwrapOk(RulesetUrl.fromRaw('https://thruput.se/agents/#fail-fast'));
    const badErr = unwrapErr(RulesetUrl.fromRaw('not a url'));

    assert.equal(url.toContract(), 'https://thruput.se/agents/#fail-fast');
    assert.equal(badErr.includes('RulesetUrl'), true);
  });

  test('RepositoryPath, Ref, ThreadId, Identifier, PositiveInteger, and NonEmptyText enforce schemas', () => {
    const repo = unwrapOk(RepositoryPath.fromRaw('/tmp/repo'));
    const ref = unwrapOk(Ref.fromRaw('refs/heads/main'));
    const threadId = unwrapOk(ThreadId.fromRaw('PRRT_kwDO123'));
    const id = unwrapOk(Identifier.fromRaw('thruput-io'));
    const prNum = unwrapOk(PositiveInteger.fromRaw(42));
    const text = unwrapOk(NonEmptyText.fromRaw('Non-empty text'));
    const badNum = unwrapErr(PositiveInteger.fromRaw(0));

    assert.equal(repo.toContract(), '/tmp/repo');
    assert.equal(ref.toContract(), 'refs/heads/main');
    assert.equal(threadId.toContract(), 'PRRT_kwDO123');
    assert.equal(id.toContract(), 'thruput-io');
    assert.equal(prNum.toContract(), 42);
    assert.equal(text.toContract(), 'Non-empty text');
    assert.equal(badNum.includes('PositiveInteger'), true);
  });
});
