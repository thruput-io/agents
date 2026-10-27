import { test } from "node:test";
import assert from "node:assert/strict";
import { changedFiles, parseHunks } from "./diff.ts";

const diff = [
  'diff --git a/scripts/verify.sh b/scripts/verify.sh',
  'index 1111111..2222222 100644',
  '--- a/scripts/verify.sh',
  '+++ b/scripts/verify.sh',
  '@@ -18,3 +18,4 @@ jsonschema=(npx)',
  ' lint',
  '-old',
  '+new',
  '+added',
  ' tail',
  'diff --git a/web/_includes/chain.html b/web/_includes/chain.html',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/web/_includes/chain.html',
  '@@ -0,0 +1,2 @@',
  '+<ul>',
  '+</ul>',
  'diff --git a/gone.txt b/gone.txt',
  'deleted file mode 100644',
  '--- a/gone.txt',
  '+++ /dev/null',
  '@@ -1,2 +0,0 @@',
  '-a',
  '-b',
  '--- not a header',
  '',
].join('\n');

test('parseDiff numbers added lines at head and removed lines at base with their text, per file', () => {
  assert.deepEqual(changedFiles(diff), [
    { path: 'scripts/verify.sh', added: [{ start: 19, end: 20 }], removed: [{ start: 19, end: 19, content: 'old' }] },
    { path: 'web/_includes/chain.html', added: [{ start: 1, end: 2 }], removed: [] },
    { path: 'gone.txt', added: [], removed: [{ start: 1, end: 3, content: 'a\nb\n-- not a header' }] },
  ]);
});

test('parseHunks reads a compare-API patch without file headers', () => {
  assert.deepEqual(parseHunks(['@@ -5,2 +5,3 @@', ' keep', '+one', '+two', ' keep']), { added: [{ start: 6, end: 7 }], removed: [] });
});

