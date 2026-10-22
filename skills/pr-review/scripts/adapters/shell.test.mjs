import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runCommand, runCommandBuffer, runCommandInDir } from './shell.mjs';

describe('shell adapter', () => {
  it('runs commands and returns stdout or buffer and rejects non-zero exit codes', () => {
    const out = runCommand('node', ['-e', 'process.stdout.write("hello")']);
    assert.equal(out, 'hello');

    const buf = runCommandBuffer('node', ['-e', 'process.stdout.write("bytes")']);
    assert.equal(Buffer.isBuffer(buf), true);
    assert.equal(buf.toString('utf8'), 'bytes');

    const inDir = runCommandInDir('node', ['-e', 'process.stdout.write(process.cwd())'], '/tmp');
    assert.equal(inDir.endsWith('/tmp'), true);

    assert.throws(
      () => runCommand('node', ['-e', 'process.stderr.write("boom"); process.exit(2)']),
      /failed: boom/,
    );
  });
});
