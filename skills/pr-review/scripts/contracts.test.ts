import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import type { z } from 'zod';
import * as contracts from './domain/contracts.g.ts';

const cases: [string, z.ZodType][] = [
  ['review/pull-request.schema.json', contracts.PullRequestSchema],
  ['review/lines.schema.json', contracts.LinesSchema],
  ['review/fragment.schema.json', contracts.FragmentSchema],
  ['review/change-set.schema.json', contracts.ChangeSetSchema],
  ['review/threads.schema.json', contracts.ThreadsSchema],
  ['review/violation.schema.json', contracts.ViolationSchema],
  ['review/ledger.schema.json', contracts.LedgerSchema],
  ['review/outcome.schema.json', contracts.OutcomeSchema],
  ['review/instructions/context.schema.json', contracts.ContextInstructionsSchema],
  ['review/instructions/dead-code.schema.json', contracts.DeadCodeInstructionsSchema],
  ['review/instructions/reuse.schema.json', contracts.ReuseInstructionsSchema],
  ['review/instructions/rules.schema.json', contracts.RulesInstructionsSchema],
];

function examplesOf(rel: string): unknown[] {
  const doc = JSON.parse(readFileSync(new URL(`../schemas/${rel}`, import.meta.url), 'utf8')) as { examples: unknown[] };
  return doc.examples;
}

describe('generated contracts', () => {
  for (const [rel, schema] of cases) {
    it(`accept every example of ${rel}`, () => {
      const examples = examplesOf(rel);
      assert.ok(examples.length > 0);
      for (const example of examples) {
        assert.equal(schema.safeParse(example).success, true);
      }
    });
  }

  it('reject an agent instruction without a probe kind', () => {
    assert.equal(contracts.AgentInstructionsSchema.safeParse({ instructions: [] }).success, false);
  });

  it('know the probe kinds that carry a rulebook', () => {
    assert.deepEqual([...contracts.RULEBOOK_PROBE_KINDS].sort(), ['dead-code', 'reuse']);
  });
});
