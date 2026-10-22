import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { z } from 'zod';
import { jsonSchemaToZod } from 'json-schema-to-zod';

function collectSchemas(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectSchemas(full));
    } else if (entry.endsWith('.schema.json')) {
      files.push(full);
    }
  }
  return files.sort();
}

function resolvePointer(root, pointer) {
  const parts = pointer
    .slice(2)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current = root;
  for (const part of parts) {
    if (current === null || typeof current !== 'object' || !(part in current)) {
      throw new Error(`Unresolved pointer: ${pointer} at segment ${part}`);
    }
    current = current[part];
  }
  return current;
}

function dereferencePointers(node, root) {
  if (Array.isArray(node)) {
    return node.map((item) => dereferencePointers(item, root));
  }
  if (node === null || typeof node !== 'object') {
    return node;
  }
  if (typeof node.$ref === 'string' && node.$ref.startsWith('#/')) {
    const target = resolvePointer(root, node.$ref);
    const resolvedTarget = dereferencePointers(target, root);
    const { $ref: _ignored, ...rest } = node;
    if (Object.keys(rest).length === 0) {
      return resolvedTarget;
    }
    return { ...resolvedTarget, ...dereferencePointers(rest, root) };
  }
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === '$defs') {
      continue;
    }
    out[key] = dereferencePointers(value, root);
  }
  return out;
}

const schemaRoot = '/fixtures/schemas';
const schemaFiles = collectSchemas(schemaRoot);
mkdirSync('/tmp/gen-jstz', { recursive: true });

const results = [];

for (const file of schemaFiles) {
  const rel = relative(schemaRoot, file);
  const bundledRaw = execFileSync(
    './node_modules/.bin/jsonschema',
    ['bundle', '--without-id', '-r', schemaRoot, file],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  const bundled = JSON.parse(bundledRaw);

  let rawFromJsonSchema = 'PASS';
  try {
    z.fromJSONSchema(bundled);
  } catch (err) {
    rawFromJsonSchema = `FAIL: ${err.message}`;
  }

  let derefFromJsonSchema = 'PASS';
  let dereferenced = null;
  try {
    dereferenced = dereferencePointers(bundled, bundled);
    z.fromJSONSchema(dereferenced);
  } catch (err) {
    derefFromJsonSchema = `FAIL: ${err.message}`;
  }

  let jstzResult = 'PASS';
  let jstzHasStrict = false;
  try {
    const code = jsonSchemaToZod(dereferenced, { module: 'esm', name: 'schema' });
    jstzHasStrict = code.includes('.strict()');
    const outPath = `/tmp/gen-jstz/${rel.replace(/[\/\.]/g, '_')}.mjs`;
    writeFileSync(outPath, code);
    await import(outPath);
  } catch (err) {
    jstzResult = `FAIL: ${err.name}: ${err.message.split('\n')[0]}`;
  }

  results.push({
    schema: rel,
    rawFromJsonSchema,
    derefFromJsonSchema,
    jstzResult,
    jstzHasStrict,
  });
}

console.log(JSON.stringify(results, null, 2));
