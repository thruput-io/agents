import { z } from 'zod';
import { CONSTANTS, DEFS, SCHEMAS } from '../.generated/contracts.mjs';
import { Checkout } from './checkout.mjs';
import { NonEmptyText, RulesetUrl } from './primitives.mjs';
import { Result } from './result.mjs';
import { Review } from './review.mjs';
import { Rulebook } from './rulebook.mjs';

const rulesetSchema = z.fromJSONSchema(DEFS['instructions/context.schema.json#/$defs/Ruleset']);
const instructionSchemas = {
  rules: z.fromJSONSchema(SCHEMAS['instructions/rules.schema.json']),
  reuse: z.fromJSONSchema(SCHEMAS['instructions/reuse.schema.json']),
  'dead-code': z.fromJSONSchema(SCHEMAS['instructions/dead-code.schema.json']),
  context: z.fromJSONSchema(SCHEMAS['instructions/context.schema.json']),
};
const rulesetToken = Symbol('Ruleset');
const instructionsToken = Symbol('AgentInstructions');
const GITHUB_BLOB = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/;
const NEEDS_CHECKOUT = ['reuse', 'dead-code'];

function stampConstants(raw) {
  if (raw === null || typeof raw !== 'object' || typeof raw.kind !== 'string') return raw;
  const task = CONSTANTS.tasks[raw.kind];
  if (task === undefined) return raw;
  const withRulebook =
    raw.rulebook !== undefined &&
    raw.rulebook !== null &&
    typeof raw.rulebook === 'object' &&
    !('instructions' in raw.rulebook)
      ? { ...raw, rulebook: { instructions: CONSTANTS.rulebookInstructions, ...raw.rulebook } }
      : raw;
  return {
    instructions: CONSTANTS.agentInstructions,
    task,
    ...withRulebook,
  };
}

export class Ruleset {
  #url;
  #title;
  #focus;
  #whenToUse;
  #text;
  constructor(guard, url, title, focus, whenToUse, text) {
    if (guard !== rulesetToken) throw new Error('Use Ruleset.fromRaw to construct Ruleset');
    this.#url = url;
    this.#title = title;
    this.#focus = focus;
    this.#whenToUse = whenToUse;
    this.#text = text;
    Object.freeze(this);
  }
  static fromRaw(raw) {
    return Result.fromZod(rulesetSchema, raw, (v) => v).flatMap((v) =>
      RulesetUrl.fromRaw(v.url).flatMap((url) =>
        NonEmptyText.fromRaw(v.title).flatMap((title) =>
          NonEmptyText.fromRaw(v.focus).flatMap((focus) =>
            NonEmptyText.fromRaw(v.whenToUse).flatMap((whenToUse) =>
              NonEmptyText.fromRaw(v.text).map(
                (text) => new Ruleset(rulesetToken, url, title, focus, whenToUse, text),
              ),
            ),
          ),
        ),
      ),
    );
  }
  static rawGitHubUrl(canonicalUrl) {
    const match = GITHUB_BLOB.exec(canonicalUrl);
    if (match === null) return Result.err(`${canonicalUrl} is not a file on github.com`);
    return Result.ok(`https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}`);
  }
  static fromIndex(index, textsMap) {
    return Result.collect(
      index.map((entry) => {
        if (!textsMap.has(entry.canonical_url)) {
          return Result.err(`the ruleset ${entry.canonical_url} was not read`);
        }
        return Ruleset.fromRaw({
          url: entry.canonical_url,
          title: entry.title,
          focus: entry.focus,
          whenToUse: entry.when_to_use,
          text: textsMap.get(entry.canonical_url),
        });
      }),
    );
  }
  url() {
    return this.#url;
  }
  toContract() {
    return {
      url: this.#url.toContract(),
      title: this.#title.toContract(),
      focus: this.#focus.toContract(),
      whenToUse: this.#whenToUse.toContract(),
      text: this.#text.toContract(),
    };
  }
}

export class AgentInstructions {
  #kind;
  #review;
  #rulebook;
  #checkout;
  #rulesets;
  #contract;
  constructor(guard, kind, review, rulebook, checkout, rulesets, contract) {
    if (guard !== instructionsToken) {
      throw new Error('Use AgentInstructions.fromRaw to construct AgentInstructions');
    }
    this.#kind = kind;
    this.#review = review;
    this.#rulebook = rulebook;
    this.#checkout = checkout;
    this.#rulesets = rulesets;
    this.#contract = Object.freeze({ ...contract });
    Object.freeze(this);
  }
  static fromRaw(raw) {
    const stamped = stampConstants(raw);
    if (stamped === null || typeof stamped !== 'object' || !(stamped.kind in instructionSchemas)) {
      return Result.err('AgentInstructions: invalid or missing kind');
    }
    const schema = instructionSchemas[stamped.kind];
    return Result.fromZod(schema, stamped, (v) => v).flatMap((v) =>
      Review.fromRaw(v.review).flatMap((review) => {
        if (v.kind === 'context') {
          return Result.collect(v.rulesets.map((rs) => Ruleset.fromRaw(rs))).map(
            (rulesets) =>
              new AgentInstructions(instructionsToken, v.kind, review, null, null, rulesets, v),
          );
        }
        return Rulebook.fromRaw(v.rulebook).flatMap((rb) => {
          if (NEEDS_CHECKOUT.includes(v.kind)) {
            return Checkout.fromRaw(v.checkout).map(
              (co) => new AgentInstructions(instructionsToken, v.kind, review, rb, co, null, v),
            );
          }
          return Result.ok(
            new AgentInstructions(instructionsToken, v.kind, review, rb, null, null, v),
          );
        });
      }),
    );
  }
  static buildAll(context, partitionedProbes, handedRulesets) {
    const specs = [
      ...partitionedProbes.map((probe) => ({
        name: probe.name,
        kind: probe.kind,
        extra: {
          rulebook: probe.rulebook.toContract(),
          ...(NEEDS_CHECKOUT.includes(probe.kind) ? { checkout: context.checkout } : {}),
        },
      })),
      {
        name: 'context',
        kind: 'context',
        extra: { rulesets: handedRulesets.map((r) => r.toContract()) },
      },
    ];
    return Result.collect(
      specs.map((spec, idx) => {
        const numberedName = `${String(idx + 1).padStart(2, '0')}-${spec.name}`;
        return AgentInstructions.fromRaw({
          kind: spec.kind,
          review: {
            ...context.reviewBase,
            ledger: context.ledgerPathFor(numberedName),
            report: context.reportCommandFor(numberedName),
          },
          ...spec.extra,
        }).map((instructions) => Object.freeze({ name: numberedName, instructions }));
      }),
    );
  }
  kind() {
    return this.#kind;
  }
  review() {
    return this.#review;
  }
  rulebook() {
    return this.#rulebook;
  }
  checkout() {
    return this.#checkout;
  }
  rulesets() {
    return this.#rulesets;
  }
  toContract() {
    return this.#contract;
  }
}
