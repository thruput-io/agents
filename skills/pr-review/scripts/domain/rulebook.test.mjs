import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Rulebook, slug } from './rulebook.mjs';

const SAMPLE_GOVERNANCE = {
  principles: [
    {
      id: 'Fail fast',
      parent: "Crash, don't guess",
      body: 'A system fails loudly on an [[Illegal state]].',
    },
    {
      id: 'Choose boring technology',
      parent: 'Code is a liability, not an asset',
      body: 'Keep the [[Development Stack]] small.',
    },
    {
      id: "You aren't gonna need it",
      parent: 'Code is a liability, not an asset',
      body: 'Delete unused code.',
    },
  ],
  definitions: [
    {
      id: 'Exit status',
      specification: 'The number a process returns.',
    },
    {
      id: 'Illegal state',
      specification: 'An invalid combination of values.',
      closedEnumerationOf: ['Nested term'],
    },
    {
      id: 'Nested term',
      specification: 'Transitively included via enumeration.',
    },
    {
      id: 'Development Stack',
      specification: 'Ways to meet a need.',
    },
    {
      id: 'Unused term',
      specification: 'Should not be included when uncited.',
    },
  ],
};

const SAMPLE_RULES = [
  {
    id: 'No suppressed exit status',
    marker: 'MUST NOT',
    group: 'Failure Handling',
    parent: 'Fail fast',
    body: "Discard a command's non-zero [[Exit status]] so that a failure passes as success.",
  },
  {
    id: 'No new code where an external tool serves',
    marker: 'MUST NOT',
    group: 'Reuse',
    parent: 'Choose boring technology',
    body: 'Write new code when a tool serves.',
  },
  {
    id: 'Delete unused',
    marker: 'MUST',
    group: 'Dead Code',
    parent: "You aren't gonna need it",
    body: 'Delete unused code.',
  },
];

describe('Rulebook and slug', () => {
  it('computes URL slugs and resolves parent principles and transitive glossary definitions', () => {
    assert.equal(slug("Crash, don't guess"), 'crash-dont-guess');
    const rb = Rulebook.fromGroup([SAMPLE_RULES[0]], SAMPLE_GOVERNANCE).unwrap();
    assert.deepEqual(rb.ruleIds(), ['No suppressed exit status']);
    assert.deepEqual(
      rb.toContract().definitions.map((d) => d.id),
      ['Exit status', 'Illegal state', 'Nested term'],
    );
    assert.equal(
      rb.principleCitationForRule('No suppressed exit status').unwrap(),
      '[Fail fast](https://thruput.se/agents/#fail-fast)',
    );
  });

  it('partitions governance rules by group and verifies Reuse and Dead Code groups exist', () => {
    const groups = Rulebook.partitionGovernance(SAMPLE_RULES, SAMPLE_GOVERNANCE).unwrap();
    assert.deepEqual(
      groups.map((g) => ({ name: g.name, kind: g.kind })),
      [
        { name: 'failure-handling', kind: 'rules' },
        { name: 'reuse', kind: 'reuse' },
        { name: 'dead-code', kind: 'dead-code' },
      ],
    );

    const missingSpecial = Rulebook.partitionGovernance([SAMPLE_RULES[0]], SAMPLE_GOVERNANCE);
    assert.equal(missingSpecial.isErr, true);
  });
});
