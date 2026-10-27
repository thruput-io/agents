import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsonSchemaToZod, parseSchema, type JsonSchema, type JsonSchemaObject, type Refs } from 'json-schema-to-zod';

type SchemaMap = Record<string, unknown>;

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = join(SKILL_DIR, 'scripts/domain/contracts.g.ts');
const PROJECT_ROOT = process.env['PROJECT_ROOT'];
if (PROJECT_ROOT === undefined) throw new Error('PROJECT_ROOT is not set: run scripts/verify.sh, which bundles the schemas');
const BUNDLE_SCHEMAS_DIR = join(PROJECT_ROOT, 'build/schemas');
const IGNORED_KEYS = new Set(['$defs', '$id', '$schema', '$dynamicAnchor', 'examples']);
const EXTERNAL_PREFIX = 'https://';

function isRecord(val: unknown): val is SchemaMap {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function listBundles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? listBundles(join(dir, entry.name)).map((rel) => join(entry.name, rel)) : [entry.name]))
    .filter((name) => name.endsWith('.schema.json'))
    .sort();
}

const docs = new Map<string, SchemaMap>(
  listBundles(BUNDLE_SCHEMAS_DIR).map((rel) => [rel, JSON.parse(readFileSync(join(BUNDLE_SCHEMAS_DIR, rel), 'utf8')) as SchemaMap]),
);

function docOf(rel: string): SchemaMap {
  const doc = docs.get(rel);
  if (doc === undefined) throw new Error(`Missing bundle ${rel}`);
  return doc;
}

function defsOf(doc: SchemaMap): SchemaMap {
  return isRecord(doc['$defs']) ? doc['$defs'] : {};
}

function decodeToken(token: string): string {
  return token.replaceAll('~1', '/').replaceAll('~0', '~');
}

function getByPointer(root: SchemaMap, ref: string): unknown {
  if (ref === '#') return root;
  if (!ref.startsWith('#/')) throw new Error(`Unbundled $ref ${ref}`);
  return ref.slice(2).split('/').map(decodeToken).reduce<unknown>((cur, part) => {
    if (!isRecord(cur) || !(part in cur)) throw new Error(`Missing pointer ${ref}`);
    return cur[part];
  }, root);
}

function resolveRef(ref: string, root: SchemaMap, seen: ReadonlySet<string>): SchemaMap {
  if (seen.has(ref)) throw new Error(`Circular $ref: ${ref}`);
  const resolved = resolveNode(getByPointer(root, ref), root, new Set([...seen, ref]));
  return isRecord(resolved) ? resolved : {};
}

function stripKeys(obj: SchemaMap, keys: readonly string[]): SchemaMap {
  const keySet = new Set(keys);
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !keySet.has(k)));
}

function branchesOf(obj: SchemaMap): unknown[] | null {
  if (Array.isArray(obj['oneOf'])) return obj['oneOf'] as unknown[];
  return Array.isArray(obj['anyOf']) ? (obj['anyOf'] as unknown[]) : null;
}

function mergeTwo(base: SchemaMap, extra: SchemaMap): SchemaMap {
  const baseProps: SchemaMap = isRecord(base['properties']) ? base['properties'] : {};
  const extraProps: SchemaMap = isRecord(extra['properties']) ? extra['properties'] : {};
  const mergedProps: SchemaMap = Object.fromEntries([
    ...Object.entries(baseProps),
    ...Object.entries(extraProps).map(([k, v]): [string, unknown] => [
      k, k in baseProps && isRecord(baseProps[k]) && isRecord(v) ? mergeTwo(baseProps[k], v) : v,
    ]),
  ]);
  const baseReq = Array.isArray(base['required']) ? (base['required'] as string[]) : [];
  const extraReq = Array.isArray(extra['required']) ? (extra['required'] as string[]) : [];
  const mergedReq = Array.from(new Set([...baseReq, ...extraReq]));
  const combined: SchemaMap = {
    ...stripKeys(base, ['oneOf', 'anyOf']),
    ...stripKeys(extra, ['oneOf', 'anyOf']),
    ...(Object.keys(mergedProps).length > 0 ? { properties: mergedProps } : {}),
    ...(mergedReq.length > 0 ? { required: mergedReq } : {}),
  };
  const b1List = branchesOf(base);
  const b2List = branchesOf(extra);
  if (!b1List && !b2List) return combined;
  const rawBranches = (b1List && b2List
    ? b1List.flatMap((b1) => b2List.map((b2) => (isRecord(b1) && isRecord(b2) ? mergeTwo(b1, b2) : b2)))
    : b1List !== null ? b1List : b2List !== null ? b2List : []
  ).filter(isRecord);
  const shared = Object.fromEntries(Object.entries(combined).filter(([k]) => k === 'type' || k === 'properties' || k === 'required'));
  const oneOf = Object.keys(shared).length > 0 ? rawBranches.map((branch) => mergeTwo(shared, branch)) : rawBranches;
  return { ...stripKeys(combined, ['type', 'properties', 'required']), oneOf };
}

function shouldDropEntry(key: string, val: unknown): boolean {
  if (IGNORED_KEYS.has(key)) return true;
  if ((key === 'additionalProperties' || key === 'unevaluatedProperties') && val === false) return true;
  return key === '$dynamicRef' && typeof val === 'string' && val.startsWith('#');
}

function resolveNode(node: unknown, root: SchemaMap, seen: ReadonlySet<string>): unknown {
  if (Array.isArray(node)) return node.map((item) => resolveNode(item, root, seen));
  if (!isRecord(node)) return node;
  const refBase = typeof node['$ref'] === 'string' ? resolveRef(node['$ref'], root, seen) : {};
  const allOfMerged = Array.isArray(node['allOf'])
    ? node['allOf'].reduce<SchemaMap>((acc, sub) => {
        const res = resolveNode(sub, root, seen);
        return isRecord(res) ? mergeTwo(acc, res) : acc;
      }, refBase)
    : refBase;
  const ownResolved = Object.fromEntries(
    Object.entries(node)
      .filter(([key, val]) => key !== '$ref' && key !== 'allOf' && !shouldDropEntry(key, val))
      .map(([key, val]) => [key, resolveNode(val, root, seen)]),
  );
  return mergeTwo(allOfMerged, ownResolved);
}

function pascalCase(raw: string): string {
  return raw.split(/[^a-zA-Z0-9]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

function customOverride(schema: JsonSchemaObject, refs: Refs): string | undefined {
  if (schema.const !== undefined) {
    const base = Array.isArray(schema.const)
      ? `z.tuple([${(schema.const as unknown[]).map((v) => `z.literal(${JSON.stringify(v)})`).join(', ')}])`
      : `z.literal(${JSON.stringify(schema.const)})`;
    const propName = refs.path.at(-1);
    return propName !== 'kind' && propName !== 'verdict'
      ? `${base}.default(${JSON.stringify(schema.const)})`
      : base;
  }
  const branches = branchesOf(schema);
  if (branches !== null) return `z.xor([${branches.map((b) => parseSchema(b as JsonSchema, refs)).join(', ')}])`;
  if (schema.type === 'object' && isRecord(schema.propertyNames) && isRecord(schema.additionalProperties) && !schema.properties) {
    const keySchema = parseSchema(schema.propertyNames, refs);
    const valSchema = parseSchema(schema.additionalProperties, refs);
    return `z.record(${keySchema}, ${valSchema}).refine((v) => { const ks = Object.keys(v).map(Number).sort((a, b) => a - b); return ks.length >= 1 && ks.every((n, i) => i === 0 || n === (ks[i - 1] as number) + 1) && Object.values(v).every((s) => !s.includes('\\n') && !s.includes('\\r')); }, 'Expected consecutive single-line entries')`;
  }
  if (schema.type === 'object' && isRecord(schema['not']) && Array.isArray(schema['not']['required'])) {
    const reqs = schema['not']['required'] as string[];
    const base = parseSchema(stripKeys(schema, ['not']), refs);
    return `${base}.refine((r) => !(${reqs.map((k) => `r.${k} !== undefined`).join(' && ')}), 'Mutually exclusive fields')`;
  }
  if (schema.type === 'object' && isRecord(schema.properties) && 'start' in schema.properties && 'end' in schema.properties && !('__range' in schema)) {
    const base = parseSchema({ ...schema, __range: true }, refs);
    return `${base}.refine((r) => r.end >= r.start, 'Expected start <= end')`;
  }
  if (schema.type === 'string' && schema.format === 'uri') {
    return "z.url().refine((u) => u.startsWith('https://') || u.startsWith('http://'), 'Expected http(s) URL')";
  }
  return;
}

function rootName(rel: string): string {
  if (rel === 'review/agent-instructions.schema.json') return 'AgentInstructionsBase';
  const base = pascalCase(basename(rel, '.schema.json'));
  return rel.startsWith('review/instructions/') ? `${base}Instructions` : base;
}

const reviewRels = Array.from(docs.keys()).filter((rel) => rel.startsWith('review/'));
const resolvedRoots = new Map<string, SchemaMap>(
  reviewRels.map((rel) => [rel, resolveNode(docOf(rel), docOf(rel), new Set()) as SchemaMap]),
);
const rootSchemas = reviewRels.map((rel): [string, unknown] => [rootName(rel), resolvedRoots.get(rel)]);
const ownDefs = reviewRels.flatMap((rel): [string, unknown][] =>
  Object.entries(defsOf(docOf(rel)))
    .filter(([defName]) => !defName.startsWith(EXTERNAL_PREFIX))
    .map(([defName, defNode]): [string, unknown] => [
      rel === 'review/outcome.schema.json' && defName === 'Verdict' ? 'OutcomeVerdict' : defName,
      resolveNode(defNode, docOf(rel), new Set()),
    ]),
);
const governanceDefs = (['rules', 'principles', 'definitions'] as const).map((gov): [string, unknown] => {
  const rel = `governance/${gov}.schema.json`;
  const defName = pascalCase(gov.slice(0, -1));
  const defs = defsOf(docOf(rel));
  if (!(defName in defs)) throw new Error(`Missing $defs.${defName} in ${rel}`);
  return [defName, resolveNode(defs[defName], docOf(rel), new Set())];
});

const instructionRels = reviewRels.filter((rel) => rel.startsWith('review/instructions/'));
const instructionSchemaNames = instructionRels.map((rel) => `${rootName(rel)}Schema`);
const rulebookProbeKinds = instructionRels.flatMap((rel) => {
  const resolved = resolvedRoots.get(rel);
  if (resolved === undefined || !isRecord(resolved['properties']) || !('rulebook' in resolved['properties'])) return [];
  const kindProp = isRecord(resolved['properties']['kind']) ? resolved['properties']['kind'] : undefined;
  return kindProp !== undefined && typeof kindProp['const'] === 'string' && kindProp['const'] !== 'rules' ? [kindProp['const']] : [];
});

const lines = [
  "import { z } from 'zod';",
  ...[...rootSchemas, ...ownDefs, ...governanceDefs].map(([name, schema]) => {
    const expr = jsonSchemaToZod(schema as JsonSchema, { zodVersion: 4, withoutDescribes: true, parserOverride: customOverride });
    return `export const ${name}Schema = ${expr};\nexport type ${name} = z.infer<typeof ${name}Schema>;`;
  }),
  `export const AgentInstructionsSchema = z.xor([${instructionSchemaNames.join(', ')}]);`,
  'export type AgentInstructions = z.infer<typeof AgentInstructionsSchema>;',
  `export const RULEBOOK_PROBE_KINDS: ReadonlySet<string> = new Set(${JSON.stringify(rulebookProbeKinds)});\n`,
];
mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');
