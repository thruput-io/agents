import { slug } from './ledger.mjs';

export * from './surface.mjs';
export * from './ledger.mjs';

export function partition(rules) {
  const groups = new Map();
  for (const rule of rules) {
    if (!groups.has(rule.group)) groups.set(rule.group, []);
    groups.get(rule.group).push(rule);
  }
  return [...groups].map(([group, members]) => ({ name: slug(group), group, rules: members }));
}

const KIND_OF_GROUP = new Map([['Reuse', 'reuse'], ['Dead Code', 'dead-code']]);

export function kindOf(group) {
  return KIND_OF_GROUP.has(group) ? KIND_OF_GROUP.get(group) : 'rules';
}

export function checkKinds(groups) {
  const absent = [...KIND_OF_GROUP.keys()].filter((group) => !groups.includes(group));
  if (absent.length > 0) throw new Error(`no rule is in the group ${absent.join(', ')}, which a kind of probe is tied to: the group was renamed or removed`);
}

const CITATION = /\[\[([^\]]+)\]\]/g;

const unique = (items) => [...new Set(items)];
const texts = (value) => {
  if (typeof value === 'string') return [value];
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(texts);
  return [];
};
const named = (entry) => unique([
  ...texts(entry).flatMap((text) => [...text.matchAll(CITATION)].map((match) => match[1])),
  ...(Array.isArray(entry.closedEnumerationOf) ? entry.closedEnumerationOf : []),
  ...(Array.isArray(entry.openEnumerationOf) ? entry.openEnumerationOf : []),
]);

function parents(children, entries, level) {
  return unique(children.map((child) => child.parent)).map((id) => {
    const parent = entries.find((entry) => entry.id === id);
    if (parent === undefined) throw new Error(`the ${level} ${id} is named as a parent and is not declared`);
    return parent;
  });
}

export function rulebook(rules, governance) {
  const principles = parents(rules, governance.principles, 'principle');
  const glossary = new Map(governance.definitions.map((definition) => [definition.id, definition]));
  const cited = new Set();
  const unread = [...rules, ...principles];
  while (unread.length > 0) {
    for (const id of named(unread.shift()).filter((candidate) => glossary.has(candidate) && !cited.has(candidate))) {
      cited.add(id);
      unread.push(glossary.get(id));
    }
  }
  return { rules, principles, definitions: governance.definitions.filter((definition) => cited.has(definition.id)) };
}

export function rawUrl(canonicalUrl) {
  const file = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(canonicalUrl);
  if (file === null) throw new Error(`${canonicalUrl} is not a file on github.com`);
  return `https://raw.githubusercontent.com/${file[1]}/${file[2]}/${file[3]}`;
}

export function rulesets(index, textsMap) {
  return index.map((entry) => {
    if (!textsMap.has(entry.canonical_url)) throw new Error(`the ruleset ${entry.canonical_url} was not read`);
    return { url: entry.canonical_url, title: entry.title, focus: entry.focus, whenToUse: entry.when_to_use, text: textsMap.get(entry.canonical_url) };
  });
}

const LOOKS_BEYOND_THE_CHANGE = ['reuse', 'dead-code'];

export function instructions(context, probes, handedRulesets) {
  const checkedOut = (kind) => (LOOKS_BEYOND_THE_CHANGE.includes(kind) ? { checkout: context.checkout } : {});
  const handed = [
    ...probes.map((probe) => ({ name: probe.name, kind: probe.kind, beyond: { rulebook: probe.rulebook, ...checkedOut(probe.kind) } })),
    { name: 'context', kind: 'context', beyond: { rulesets: handedRulesets } },
  ];
  return handed.map((probe, i) => {
    const name = `${String(i + 1).padStart(2, '0')}-${probe.name}`;
    return { name, document: { kind: probe.kind, review: { ...context.review, ledger: context.ledger(name), report: context.report(name) }, ...probe.beyond } };
  });
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const schemaProperties = (schema) => (schema.properties === undefined ? {} : schema.properties);
const schemaAllOf = (schema) => (schema.allOf === undefined ? [] : schema.allOf);

function resolve(read, name, ref) {
  const [path, pointer] = ref.split('#');
  const target = path === '' ? name : new URL(path, `file:///${name}`).pathname.slice(1);
  const segments = pointer === undefined ? [] : pointer.split('/').filter(Boolean);
  return { name: target, schema: segments.reduce((node, key) => node[key], read(target)) };
}

function fixed(read, name, schema) {
  const target = schema.$ref === undefined ? undefined : resolve(read, name, schema.$ref);
  const referenced = target === undefined ? [] : fixed(read, target.name, target.schema);
  const own = Object.entries(schemaProperties(schema)).filter(([, property]) => 'const' in property).map(([property, { const: value }]) => [property, value]);
  const inherited = schemaAllOf(schema).flatMap((branch) => fixed(read, name, branch));
  return [...referenced, ...inherited, ...own];
}

function completeWithSchema(read, name, document, schema) {
  let completed = document;
  if (schema.$ref !== undefined) {
    const target = resolve(read, name, schema.$ref);
    completed = completeWithSchema(read, target.name, completed, target.schema);
  }
  if (Array.isArray(completed)) return schema.items === undefined ? completed : completed.map((item) => completeWithSchema(read, name, item, schema.items));
  if (typeof completed !== 'object' || completed === null) return completed;
  if (schema.oneOf !== undefined) {
    const belongs = schema.oneOf.filter((branch) => fixed(read, name, branch).every(([property, value]) => !(property in completed) || same(completed[property], value)));
    if (belongs.length !== 1) throw new Error(`${name}: the document belongs to ${belongs.length} of the ${schema.oneOf.length} branches, so what its schema says cannot be told`);
    completed = completeWithSchema(read, name, completed, belongs[0]);
  }
  for (const branch of schemaAllOf(schema)) {
    completed = completeWithSchema(read, name, completed, branch);
  }
  const properties = schemaProperties(schema);
  const own = Object.entries(completed).map(([property, value]) => [property, property in properties ? completeWithSchema(read, name, value, properties[property]) : value]);
  return Object.fromEntries([...fixed(read, name, schema), ...own]);
}

export function complete(read, name, document) {
  return completeWithSchema(read, name, document, read(name));
}
