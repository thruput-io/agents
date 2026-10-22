import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CONSTANTS } from './contracts.mjs';
import { AgentInstructions, Ruleset } from './agent-instructions.mjs';
import { Rulebook } from './rulebook.mjs';

const SHA = 'e2bde7afe2f2b1ffc23cdb6f0dc00601b4868eb7';

const SAMPLE_REVIEW = {
  pullRequest: {
    host: { kind: 'github', owner: 'thruput-io', repository: 'agents', number: 12 },
    author: 'agent-rasmus[bot]',
    description: 'Verify runs html-validate.',
  },
  headCommit: SHA,
  files: [
    {
      path: 'scripts/verify.sh',
      fragments: [{ kind: 'surface', side: 'head', lines: { 21: 'lychee "$site"' } }],
    },
  ],
  ledger: '/tmp/work/ledger/01-failure-handling.json',
  report: 'node check.mjs /tmp/work/instructions/01-failure-handling.yaml',
};

const SAMPLE_RULEBOOK = {
  instructions: CONSTANTS.rulebookInstructions,
  rules: [
    {
      id: 'No suppressed exit status',
      marker: 'MUST NOT',
      group: 'Failure Handling',
      parent: 'Fail fast',
      body: "Discard a command's non-zero [[Exit status]] so that a failure passes as success.",
    },
  ],
  principles: [
    {
      id: 'Fail fast',
      parent: "Crash, don't guess",
      body: 'A system fails loudly and at once on an unexpected state.',
    },
  ],
  definitions: [
    {
      id: 'Exit status',
      specification: 'The number a process returns when it ends.',
    },
  ],
};

describe('Ruleset and AgentInstructions', () => {
  it('converts canonical GitHub blob URLs to raw URLs and builds Ruleset list from index', () => {
    const canonical =
      'https://github.com/ciembor/agent-rules-books/blob/main/ddd/ddd.md';
    assert.equal(
      Ruleset.rawGitHubUrl(canonical).unwrap(),
      'https://raw.githubusercontent.com/ciembor/agent-rules-books/main/ddd/ddd.md',
    );
    assert.equal(Ruleset.rawGitHubUrl('https://example.com/file.md').isErr, true);

    const list = Ruleset.fromIndex(
      [
        {
          canonical_url: canonical,
          title: 'DDD',
          focus: 'Modeling',
          when_to_use: 'Domain logic',
        },
      ],
      new Map([[canonical, '# DDD\n## Rule 1\n']]),
    ).unwrap();
    assert.equal(list.length, 1);
    assert.equal(list[0].url().toContract(), canonical);
  });

  it('stamps const instructions and task fields when building all probe instructions', () => {
    const rb = Rulebook.fromRaw(SAMPLE_RULEBOOK).unwrap();
    const ruleset = Ruleset.fromRaw({
      url: 'https://github.com/ciembor/agent-rules-books/blob/main/ddd/ddd.md',
      title: 'DDD',
      focus: 'Modeling',
      whenToUse: 'Domain logic',
      text: '# DDD\n',
    }).unwrap();

    const probes = AgentInstructions.buildAll(
      {
        reviewBase: {
          pullRequest: SAMPLE_REVIEW.pullRequest,
          headCommit: SHA,
          files: SAMPLE_REVIEW.files,
        },
        checkout: '/tmp/work/snapshot',
        ledgerPathFor: (name) => `/tmp/work/ledger/${name}.json`,
        reportCommandFor: (name) => `node check.mjs /tmp/work/instructions/${name}.yaml`,
      },
      [
        { name: 'failure-handling', kind: 'rules', rulebook: rb },
        { name: 'reuse', kind: 'reuse', rulebook: rb },
      ],
      [ruleset],
    ).unwrap();

    assert.equal(probes.length, 3);
    assert.equal(probes[0].name, '01-failure-handling');
    assert.deepEqual(probes[0].instructions.toContract().instructions, CONSTANTS.agentInstructions);
    assert.equal(probes[0].instructions.toContract().task, CONSTANTS.tasks.rules);
    assert.equal(probes[1].name, '02-reuse');
    assert.equal(probes[1].instructions.toContract().checkout, '/tmp/work/snapshot');
    assert.equal(probes[2].name, '03-context');
    assert.equal(probes[2].instructions.kind(), 'context');
  });
});
