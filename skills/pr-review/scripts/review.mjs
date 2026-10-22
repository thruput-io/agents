import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { azureDevOpsAdapter } from './adapters/azure-devops.mjs';
import { readDomainJson, readDomainYaml, writeDomainJson, writeTextFile } from './adapters/fs-store.mjs';
import { gitAdapter } from './adapters/git.mjs';
import { githubAdapter } from './adapters/github.mjs';
import { check } from './check.mjs';
import { AgentInstructions } from './domain/agent-instructions.mjs';
import { Outcome } from './domain/outcome.mjs';
import { PullRequest } from './domain/pull-request.mjs';
import { Threads } from './domain/threads.mjs';

export function runReview(workdir, adapters) {
  const pullRequest = readDomainJson(join(workdir, 'pull-request.json'), PullRequest).unwrap();
  const hostContract = pullRequest.host().toContract();
  const adapter = adapters.find((candidate) => candidate.kind === hostContract.kind);
  if (adapter === undefined) throw new Error(`no adapter for the host ${hostContract.kind}`);

  const names = readdirSync(join(workdir, 'instructions'))
    .filter((name) => name.endsWith('.yaml'))
    .sort();
  const probes = names.map((name) => ({
    name: name.replace(/\.yaml$/, ''),
    instructions: readDomainYaml(join(workdir, 'instructions', name), AgentInstructions).unwrap(),
  }));
  const missing = probes.filter((p) => !existsSync(p.instructions.review().ledger().toContract()));
  if (missing.length > 0) {
    throw new Error(
      `no ledger from: ${missing.map((p) => p.name).join(', ')}. Re-run those probes; a probe that wrote nothing has not run.`,
    );
  }
  const entries = names.map((name) => check(join(workdir, 'instructions', name)));
  const threads = readDomainJson(join(workdir, 'threads.json'), Threads).unwrap();
  const { outcome, mergedLedger } = Outcome.fromVerifiedEntries(entries, threads).unwrap();

  writeDomainJson(join(workdir, 'ledger.json'), mergedLedger);
  const ledgerTable = mergedLedger.toMarkdownTable();
  writeTextFile(join(workdir, 'ledger.md'), `${ledgerTable}\n`);
  writeDomainJson(join(workdir, 'outcome.json'), outcome);

  const posted = adapter.post(hostContract, outcome, ledgerTable, workdir);
  return {
    verdict: outcome.verdict(),
    rows: mergedLedger.rows().length,
    ...posted,
  };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [workdirArg] = process.argv.slice(2);
  if (workdirArg === undefined) throw new Error('usage: node review.mjs <workdir>');
  const summary = runReview(resolve(workdirArg), [githubAdapter, azureDevOpsAdapter, gitAdapter]);
  console.log(JSON.stringify(summary, null, 2));
}
