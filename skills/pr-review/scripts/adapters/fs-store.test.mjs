import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { Checkout } from '../domain/checkout.mjs';
import { Threads } from '../domain/threads.mjs';
import {
  listSnapshotFiles,
  readDomainJson,
  readDomainYaml,
  readSnapshotText,
  writeDomainJson,
  writeDomainYaml,
} from './fs-store.mjs';

describe('fs-store adapter', () => {
  it('reads and writes validated domain JSON and YAML and reads snapshot text files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fs-store-test-'));
    try {
      const threads = Threads.fromRaw({
        threads: [
          {
            id: 't-1',
            path: 'src/index.mjs',
            side: 'head',
            lines: { start: 1, end: 2 },
            state: 'open',
            body: 'Finding breaks [Fail fast](https://thruput.se/agents/#fail-fast)',
          },
        ],
      }).unwrap();

      const jsonPath = join(dir, 'nested', 'threads.json');
      writeDomainJson(jsonPath, threads);
      const readThreads = readDomainJson(jsonPath, Threads).unwrap();
      assert.deepEqual(readThreads.toContract(), threads.toContract());

      const yamlPath = join(dir, 'nested', 'threads.yaml');
      writeDomainYaml(yamlPath, threads);
      const readFromYaml = readDomainYaml(yamlPath, Threads).unwrap();
      assert.deepEqual(readFromYaml.toContract(), threads.toContract());

      const snapDir = join(dir, 'snap');
      const checkout = Checkout.fromRaw(snapDir).unwrap();
      writeDomainJson(join(snapDir, 'a.json'), checkout);
      writeFileSync(join(snapDir, 'bin.dat'), Buffer.from([0x00, 0x01, 0x02]));

      const files = listSnapshotFiles(snapDir);
      assert.deepEqual(files, ['a.json', 'bin.dat']);
      assert.equal(readSnapshotText(snapDir, 'a.json').includes(snapDir), true);
      assert.equal(readSnapshotText(snapDir, 'bin.dat'), '');
      assert.equal(readSnapshotText(snapDir, 'missing.txt'), '');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
