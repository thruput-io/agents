import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { azureDevOpsAdapter } from './adapters/azure-devops.mjs';
import {
  listSnapshotFiles,
  readRawJson,
  readRawYaml,
  readSnapshotText,
  writeDomainJson,
  writeDomainYaml,
  writeRawJson,
} from './adapters/fs-store.mjs';
import { gitAdapter } from './adapters/git.mjs';
import { githubAdapter } from './adapters/github.mjs';
import { AgentInstructions, Ruleset } from './domain/agent-instructions.mjs';
import { Host } from './domain/pull-request.mjs';
import { Result } from './domain/result.mjs';
import { Rulebook } from './domain/rulebook.mjs';
import { Surface } from './domain/surface.mjs';

async function defaultFetchText(rawUrl, canonicalUrl) {
  const response = await fetch(rawUrl);
  if (!response.ok) {
    throw new Error(`the ruleset ${canonicalUrl} could not be read: HTTP ${response.status}`);
  }
  return response.text();
}

export async function prepareWorkspace(target, workdirArg, skillDir, adapters, fetchText) {
  const host = Host.fromSpec(target).unwrap();
  const hostContract = host.toContract();
  const adapter = adapters.find((candidate) => candidate.kind === hostContract.kind);
  if (adapter === undefined) throw new Error(`no adapter for the host ${hostContract.kind}`);

  const workdir = resolve(workdirArg);
  mkdirSync(join(workdir, 'instructions'), { recursive: true });
  mkdirSync(join(workdir, 'ledger'), { recursive: true });

  const resolved = adapter.resolve(hostContract, workdir);
  const { pullRequest, headCommit } = resolved;
  writeDomainJson(join(workdir, 'pull-request.json'), pullRequest);
  if (resolved.blocked.length > 0) {
    const where =
      resolved.refused !== null
        ? resolved.refused
        : adapter.refuse(hostContract, headCommit, resolved.blocked, workdir);
    const verb = resolved.refused === null ? 'was posted' : 'had been posted';
    throw new Error(
      `${resolved.blocked.join('; ')}. A changes-requested verdict ${verb} (${where}); no review was prepared.`,
    );
  }

  const changeSet = resolved.diff();
  writeDomainJson(join(workdir, 'change-set.json'), changeSet);
  writeDomainJson(join(workdir, 'threads.json'), resolved.threads);

  const surfaceSet =
    resolved.prior === null
      ? changeSet
      : changeSet
          .narrowTo(resolved.changedSince(resolved.prior), resolved.threads.activeRangesBySide())
          .unwrap();
  if (surfaceSet.files().length === 0) {
    const priorSha = resolved.prior === null ? '' : resolved.prior.toContract();
    throw new Error(
      `nothing to review: no line of the change set changed since the prior review at ${priorSha}, and no thread of ours is open or was resolved by the author`,
    );
  }

  const snapshotDir = join(workdir, 'snapshot');
  const checkout = resolved.checkout(snapshotDir);
  const repoFiles = listSnapshotFiles(snapshotDir);

  const surfaces = Result.collect(
    surfaceSet
      .files()
      .map((file) => {
        const headText = readSnapshotText(snapshotDir, file.path().toContract());
        if (headText === '' && file.removed().length === 0) return null;
        return Surface.fromFileLinesAndChanges(
          file.path(),
          headText,
          file.added(),
          file.removed(),
        );
      })
      .filter((item) => item !== null),
  ).unwrap();

  const { rules } = readRawYaml(join(skillDir, 'rules', 'Rules.yaml'));
  const governance = {
    principles: readRawYaml(join(skillDir, 'rules', 'Principles.yaml')).principles,
    definitions: readRawYaml(join(skillDir, 'rules', 'Definitions.yaml')).definitions,
  };

  const index = readRawJson(join(skillDir, 'references', 'agent-rules-books-search-index.json'));
  const fetchedEntries = await Promise.all(
    index.map(async (entry) => [
      entry.canonical_url,
      await fetchText(Ruleset.rawGitHubUrl(entry.canonical_url).unwrap(), entry.canonical_url),
    ]),
  );
  const handedRulesets = Ruleset.fromIndex(index, new Map(fetchedEntries)).unwrap();

  const partitioned = Rulebook.partitionGovernance(rules, governance).unwrap();
  const context = {
    checkout: checkout.toContract(),
    reviewBase: {
      pullRequest: pullRequest.toContract(),
      headCommit: headCommit.toContract(),
      files: surfaces.map((s) => s.toContract()),
    },
    ledgerPathFor: (name) => join(workdir, 'ledger', `${name}.json`),
    reportCommandFor: (name) =>
      `node "${join(skillDir, 'scripts', 'check.mjs')}" "${join(workdir, 'instructions', `${name}.yaml`)}"`,
  };
  const probes = AgentInstructions.buildAll(context, partitioned, handedRulesets).unwrap();
  probes.forEach(({ name, instructions }) => {
    writeDomainYaml(join(workdir, 'instructions', `${name}.yaml`), instructions);
  });

  const summary = {
    host: hostContract.kind,
    headCommit: headCommit.toContract(),
    since: resolved.prior === null ? null : resolved.prior.toContract(),
    threadsOfOurs: resolved.threads.threads().length,
    changeSet: {
      files: changeSet.files().length,
      added: changeSet.totalAddedLines(),
      removed: changeSet.totalRemovedLines(),
    },
    surface: {
      files: surfaceSet.files().length,
      added: surfaceSet.totalAddedLines(),
      removed: surfaceSet.totalRemovedLines(),
    },
    repository: repoFiles.length,
    probes: probes.map((p) => `${p.name} (${p.instructions.kind()})`),
    rules: rules.length,
  };
  writeRawJson(join(workdir, 'summary.json'), summary);
  return summary;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [target, workdirArg] = process.argv.slice(2);
  if (workdirArg === undefined) {
    throw new Error('usage: node prepare.mjs <pull-request-url | repository@base..head> <workdir>');
  }
  const skillDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const summary = await prepareWorkspace(
    target,
    workdirArg,
    skillDir,
    [githubAdapter, azureDevOpsAdapter, gitAdapter],
    defaultFetchText,
  );
  console.log(JSON.stringify(summary, null, 2));
}
