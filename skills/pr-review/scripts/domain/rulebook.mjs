import { z } from 'zod';
import { CONSTANTS, SCHEMAS } from '../.generated/contracts.mjs';
import { Result } from './result.mjs';

const rulebookSchema = z.fromJSONSchema(SCHEMAS['rulebook.schema.json']);
const token = Symbol('Rulebook');
const CITATION = /\[\[([^\]]+)\]\]/g;
const KIND_BY_GROUP = new Map([
  ['Reuse', 'reuse'],
  ['Dead Code', 'dead-code'],
]);
export const RULES_SITE_URL = 'https://thruput.se/agents/';

export function slug(id) {
  return id
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const unique = (items) => [...new Set(items)];

function collectStrings(value) {
  if (typeof value === 'string') return [value];
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(collectStrings);
  return [];
}

function namedTerms(entry) {
  const closed = Array.isArray(entry.closedEnumerationOf) ? entry.closedEnumerationOf : [];
  const open = Array.isArray(entry.openEnumerationOf) ? entry.openEnumerationOf : [];
  return unique([
    ...collectStrings(entry).flatMap((text) => [...text.matchAll(CITATION)].map((m) => m[1])),
    ...closed,
    ...open,
  ]);
}

function expandCitedDefinitions(frontierIds, visitedIds, glossaryById) {
  const nextIds = unique(
    frontierIds.flatMap((id) => {
      const entry = glossaryById.get(id);
      return entry === undefined ? [] : namedTerms(entry);
    }),
  ).filter((id) => glossaryById.has(id) && !visitedIds.includes(id));
  if (nextIds.length === 0) return visitedIds;
  return expandCitedDefinitions(nextIds, [...visitedIds, ...nextIds], glossaryById);
}

function resolveParentPrinciples(rules, allPrinciples) {
  const parentIds = unique(rules.map((rule) => rule.parent));
  return Result.collect(
    parentIds.map((id) => {
      const found = allPrinciples.find((p) => p.id === id);
      return found === undefined
        ? Result.err(`the principle ${id} is named as a parent and is not declared`)
        : Result.ok(found);
    }),
  );
}

export class Rulebook {
  #instructions;
  #rules;
  #principles;
  #definitions;
  constructor(guard, instructions, rules, principles, definitions) {
    if (guard !== token) throw new Error('Use Rulebook.fromRaw or Rulebook.fromGroup to construct Rulebook');
    this.#instructions = instructions;
    this.#rules = Object.freeze([...rules]);
    this.#principles = Object.freeze([...principles]);
    this.#definitions = Object.freeze([...definitions]);
    Object.freeze(this);
  }
  static fromRaw(raw) {
    const withConst =
      raw !== null && typeof raw === 'object' && !('instructions' in raw)
        ? { instructions: CONSTANTS.rulebookInstructions, ...raw }
        : raw;
    return Result.fromZod(rulebookSchema, withConst, (v) => v).flatMap((v) => {
      const bothEnums = v.definitions.some(
        (d) => d.closedEnumerationOf !== undefined && d.openEnumerationOf !== undefined,
      );
      if (bothEnums) {
        return Result.err('Rulebook: a definition cannot carry both closedEnumerationOf and openEnumerationOf');
      }
      return Result.ok(new Rulebook(token, v.instructions, v.rules, v.principles, v.definitions));
    });
  }
  static fromGroup(rules, governance) {
    return resolveParentPrinciples(rules, governance.principles).flatMap((principles) => {
      const glossaryById = new Map(governance.definitions.map((d) => [d.id, d]));
      const initialIds = unique(
        [...rules, ...principles].flatMap((entry) => namedTerms(entry)),
      ).filter((id) => glossaryById.has(id));
      const allCitedIds = expandCitedDefinitions(initialIds, initialIds, glossaryById);
      const definitions = governance.definitions.filter((d) => allCitedIds.includes(d.id));
      return Rulebook.fromRaw({
        instructions: CONSTANTS.rulebookInstructions,
        rules,
        principles,
        definitions,
      });
    });
  }
  static partitionGovernance(rules, governance) {
    const grouped = rules.reduce((acc, rule) => {
      const existing = acc.find((g) => g.group === rule.group);
      if (existing !== undefined) {
        return acc.map((g) => (g.group === rule.group ? { ...g, rules: [...g.rules, rule] } : g));
      }
      return [...acc, { group: rule.group, rules: [rule] }];
    }, []);
    const groupNames = grouped.map((g) => g.group);
    const absent = [...KIND_BY_GROUP.keys()].filter((req) => !groupNames.includes(req));
    if (absent.length > 0) {
      return Result.err(
        `no rule is in the group ${absent.join(', ')}, which a kind of probe is tied to: the group was renamed or removed`,
      );
    }
    return Result.collect(
      grouped.map((g) =>
        Rulebook.fromGroup(g.rules, governance).map((rb) =>
          Object.freeze({
            name: slug(g.group),
            group: g.group,
            kind: KIND_BY_GROUP.has(g.group) ? KIND_BY_GROUP.get(g.group) : 'rules',
            rulebook: rb,
          }),
        ),
      ),
    );
  }
  rules() {
    return this.#rules;
  }
  ruleIds() {
    return this.#rules.map((r) => r.id);
  }
  principles() {
    return this.#principles;
  }
  definitions() {
    return this.#definitions;
  }
  principleCitationForRule(ruleId) {
    const found = this.#rules.find((r) => r.id === ruleId);
    if (found === undefined) return Result.err(`Rulebook: unknown rule ${ruleId}`);
    return Result.ok(`[${found.parent}](${RULES_SITE_URL}#${slug(found.parent)})`);
  }
  toContract() {
    return {
      instructions: this.#instructions,
      rules: this.#rules,
      principles: this.#principles,
      definitions: this.#definitions,
    };
  }
}
