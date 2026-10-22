import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { SCHEMAS, DEFS, CONSTANTS } from './contracts.mjs';

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCHEMA_DIR = join(SKILL_DIR, 'schemas', 'review');

function listSchemaFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? listSchemaFiles(full) : (entry.name.endsWith('.schema.json') ? [full] : []);
  });
}

test('all 17 review schemas and all DEFS compile with z.fromJSONSchema', () => {
  const files = listSchemaFiles(SCHEMA_DIR).map((f) => relative(SCHEMA_DIR, f));
  assert.equal(files.length, 17);
  assert.deepEqual(Object.keys(SCHEMAS).sort(), files.sort());
  const compiledSchemas = Object.values(SCHEMAS).map((schema) => z.fromJSONSchema(schema));
  assert.equal(compiledSchemas.length, 17);
  const compiledDefs = Object.values(DEFS).map((def) => z.fromJSONSchema(def));
  assert.equal(compiledDefs.length > 0, true);
});

test('every example in all 17 review schemas validates against its compiled Zod schema', () => {
  const results = Object.keys(SCHEMAS).flatMap((relPath) => {
    const raw = JSON.parse(readFileSync(join(SCHEMA_DIR, relPath), 'utf8'));
    const zodSchema = z.fromJSONSchema(SCHEMAS[relPath]);
    return (raw.examples || []).map((example) => ({
      relPath,
      success: zodSchema.safeParse(example).success,
    }));
  });
  assert.equal(results.length, 19);
  assert.deepEqual(results.filter((r) => !r.success), []);
});

test('compiled Zod schemas reject invalid inputs', () => {
  const pullRequest = z.fromJSONSchema(SCHEMAS['pull-request.schema.json']);
  const lineRange = z.fromJSONSchema(DEFS['lines.schema.json#/$defs/LineRange']);
  const commit = z.fromJSONSchema(DEFS['change-set.schema.json#/$defs/Commit']);
  assert.equal(pullRequest.safeParse({ host: { kind: 'github' } }).success, false);
  assert.equal(lineRange.safeParse({ start: 0, end: 5 }).success, false);
  assert.equal(commit.safeParse('not-a-sha').success, false);
});

test('compiled Zod schemas accept unknown properties on objects', () => {
  const pullRequest = z.fromJSONSchema(SCHEMAS['pull-request.schema.json']);
  const parsed = pullRequest.safeParse({
    host: { kind: 'github', owner: 'o', repository: 'r', number: 1, extraHostField: 'ignored' },
    author: 'alice',
    description: 'desc',
    extraTopField: 'ignored',
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.author, 'alice');
});

test('CONSTANTS exposes instructions and task constants from the review schemas', () => {
  assert.equal(Array.isArray(CONSTANTS.agentInstructions), true);
  assert.equal(CONSTANTS.agentInstructions.length, 8);
  assert.equal(typeof CONSTANTS.rulebookInstructions, 'string');
  assert.equal(CONSTANTS.rulebookInstructions.length > 0, true);
  assert.deepEqual(Object.keys(CONSTANTS.tasks).sort(), ['context', 'dead-code', 'reuse', 'rules']);
});
