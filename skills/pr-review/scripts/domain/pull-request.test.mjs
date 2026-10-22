import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Host, PullRequest } from './pull-request.mjs';

describe('Host and PullRequest', () => {
  it('parses GitHub, Azure DevOps, and git range specs into Host sum types', () => {
    const gh = Host.fromSpec('https://github.com/thruput-io/agents/pull/12').unwrap();
    assert.deepEqual(gh.toContract(), {
      kind: 'github',
      owner: 'thruput-io',
      repository: 'agents',
      number: 12,
    });
    assert.equal(
      gh.match({
        github: (h) => `${h.owner().toContract()}/${h.repository().toContract()}#${h.number().toContract()}`,
        azureDevOps: () => 'ado',
        git: () => 'git',
      }),
      'thruput-io/agents#12',
    );

    const ado = Host.fromSpec(
      'https://dev.azure.com/org-name/proj-name/_git/repo-name/pullrequest/42',
    ).unwrap();
    assert.deepEqual(ado.toContract(), {
      kind: 'azure-devops',
      organization: 'org-name',
      project: 'proj-name',
      repository: 'repo-name',
      id: 42,
    });

    const gitHost = Host.fromSpec('/tmp/repo@main..feature/branch').unwrap();
    assert.deepEqual(gitHost.toContract(), {
      kind: 'git',
      repository: '/tmp/repo',
      base: 'main',
      head: 'feature/branch',
    });

    assert.equal(Host.fromSpec('https://example.com/not-a-pr').isErr, true);
  });

  it('validates and round-trips PullRequest from raw contract', () => {
    const raw = {
      host: {
        kind: 'github',
        owner: 'thruput-io',
        repository: 'agents',
        number: 12,
      },
      author: 'agent-rasmus[bot]',
      description: 'Verify runs html-validate and lychee.',
    };
    const pr = PullRequest.fromRaw(raw).unwrap();
    assert.equal(pr.author().toContract(), 'agent-rasmus[bot]');
    assert.equal(pr.description(), 'Verify runs html-validate and lychee.');
    assert.deepEqual(pr.toContract(), raw);
    assert.equal(Object.isFrozen(pr), true);
  });

  it('rejects invalid PullRequest contracts', () => {
    assert.equal(
      PullRequest.fromRaw({
        host: { kind: 'github', owner: '', repository: 'agents', number: 0 },
        author: '',
        description: 'desc',
      }).isErr,
      true,
    );
  });
});
