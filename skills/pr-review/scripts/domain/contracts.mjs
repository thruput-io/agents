import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ALL_SCHEMA_DIR = join(SKILL_DIR, 'schemas');
const SCHEMA_DIR = join(ALL_SCHEMA_DIR, 'review');
const IGNORED_KEYS = new Set(['$defs', '$id', '$schema', 'examples']);

function listSchemaFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listSchemaFiles(full);
    return entry.name.endsWith('.schema.json') && !entry.name.endsWith('.g.schema.json')
      ? [full]
      : [];
  });
}

function getByPointer(doc, pointer) {
  if (!pointer || pointer === '#') return doc;
  if (!pointer.startsWith('#/')) {
    throw new Error(`Unsupported pointer: ${pointer}`);
  }
  return pointer
    .slice(2)
    .split('/')
    .reduce((cur, part) => {
      if (cur === null || typeof cur !== 'object' || !(part in cur)) {
        throw new Error(`Pointer ${pointer} not found at ${part}`);
      }
      return cur[part];
    }, doc);
}

function resolveRefTarget(currentPath, ref, docs) {
  const hashIdx = ref.indexOf('#');
  const filePart = hashIdx === -1 ? ref : ref.slice(0, hashIdx);
  const pointer = hashIdx === -1 ? '#' : ref.slice(hashIdx);
  const targetPath = filePart
    ? relative(SCHEMA_DIR, resolve(SCHEMA_DIR, dirname(currentPath), filePart))
    : currentPath;
  if (!docs.has(targetPath)) {
    throw new Error(`Unknown schema file ${targetPath} (from ${currentPath} ref ${ref})`);
  }
  return { targetPath, pointer };
}

function stripKeys(obj, keys) {
  const keySet = new Set(keys);
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !keySet.has(k)));
}

function branchesOf(obj) {
  return obj.oneOf || obj.anyOf || null;
}

function mergeTwo(base, extra) {
  const baseProps = base.properties || {};
  const extraProps = extra.properties || {};
  const mergedProps = Object.fromEntries([
    ...Object.entries(baseProps),
    ...Object.entries(extraProps).map(([k, v]) => [
      k,
      k in baseProps ? mergeTwo(baseProps[k], v) : v,
    ]),
  ]);
  const mergedReq = Array.from(new Set([...(base.required || []), ...(extra.required || [])]));
  const combined = {
    ...stripKeys(base, ['oneOf', 'anyOf']),
    ...stripKeys(extra, ['oneOf', 'anyOf']),
    ...(Object.keys(mergedProps).length > 0 ? { properties: mergedProps } : {}),
    ...(mergedReq.length > 0 ? { required: mergedReq } : {}),
  };
  const b1List = branchesOf(base);
  const b2List = branchesOf(extra);
  if (!b1List && !b2List) return combined;
  const rawBranches = b1List && b2List
    ? b1List.flatMap((b1) => b2List.map((b2) => mergeTwo(b1, b2)))
    : (b1List || b2List);
  const shared = Object.fromEntries(
    Object.entries(combined).filter(([k]) => k === 'type' || k === 'properties' || k === 'required'),
  );
  const anyOf = Object.keys(shared).length > 0
    ? rawBranches.map((branch) => mergeTwo(shared, branch))
    : rawBranches;
  return { ...combined, anyOf };
}

function shouldDropEntry(key, val) {
  if (IGNORED_KEYS.has(key)) return true;
  if (key === 'additionalProperties' && val === false) return true;
  if (key === 'unevaluatedProperties' && val === false) return true;
  return false;
}

function resolveNode(node, currentPath, docs, seen) {
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) {
    return node.map((item) => resolveNode(item, currentPath, docs, seen));
  }
  const refBase = typeof node.$ref === 'string'
    ? (() => {
        const { targetPath, pointer } = resolveRefTarget(currentPath, node.$ref, docs);
        const key = `${targetPath}#${pointer}`;
        if (seen.has(key)) {
          throw new Error(`Circular $ref detected: ${key}`);
        }
        const nextSeen = new Set(seen);
        nextSeen.add(key);
        return resolveNode(getByPointer(docs.get(targetPath), pointer), targetPath, docs, nextSeen);
      })()
    : {};
  const allOfMerged = Array.isArray(node.allOf)
    ? node.allOf.reduce(
        (acc, sub) => mergeTwo(acc, resolveNode(sub, currentPath, docs, seen)),
        refBase,
      )
    : refBase;
  const ownResolved = Object.fromEntries(
    Object.entries(node)
      .filter(([key, val]) => key !== '$ref' && key !== 'allOf' && !shouldDropEntry(key, val))
      .map(([key, val]) => [key, resolveNode(val, currentPath, docs, seen)]),
  );
  const merged = mergeTwo(allOfMerged, ownResolved);
  const withNot =
    'not' in merged && merged.not && typeof merged.not === 'object' && Array.isArray(merged.not.required)
      ? {
          ...stripKeys(merged, ['not']),
          ...(merged.not.required.length === 1
            ? { properties: { ...(merged.properties || {}), [merged.not.required[0]]: { not: {} } } }
            : {}),
        }
      : merged;
  if ('const' in withNot && Array.isArray(withNot.const)) {
    const arr = withNot.const;
    return {
      ...stripKeys(withNot, ['const']),
      type: 'array',
      prefixItems: arr.map((item) => ({ const: item })),
      minItems: arr.length,
      maxItems: arr.length,
    };
  }
  return withNot;
}

const docs = new Map(
  listSchemaFiles(ALL_SCHEMA_DIR).map((f) => [
    relative(SCHEMA_DIR, f),
    JSON.parse(readFileSync(f, 'utf8')),
  ]),
);

const reviewEntries = Array.from(docs.entries()).filter(([relPath]) => !relPath.startsWith('..'));

export const SCHEMAS = Object.fromEntries(
  reviewEntries.map(([relPath, doc]) => [
    relPath,
    resolveNode(doc, relPath, docs, new Set([`${relPath}#`])),
  ]),
);

export const DEFS = Object.fromEntries(
  reviewEntries.flatMap(([relPath, doc]) =>
    Object.entries(doc.$defs || {}).map(([defName, defNode]) => {
      const key = `${relPath}#/$defs/${defName}`;
      return [key, resolveNode(defNode, relPath, docs, new Set([key]))];
    }),
  ),
);

export const CONSTANTS = {
  agentInstructions: docs.get('agent-instructions.schema.json').properties.instructions.const,
  rulebookInstructions: docs.get('rulebook.schema.json').properties.instructions.const,
  tasks: {
    rules: docs.get('instructions/rules.schema.json').properties.task.const,
    reuse: docs.get('instructions/reuse.schema.json').properties.task.const,
    'dead-code': docs.get('instructions/dead-code.schema.json').properties.task.const,
    context: docs.get('instructions/context.schema.json').properties.task.const,
  },
};
